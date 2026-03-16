import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proposalId } = await req.json();

    if (!proposalId) {
      return new Response(JSON.stringify({ error: "proposalId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select(`
        *,
        clients(*),
        esn:sales_team!proposals_esn_id_fkey(*),
        gsn:sales_team!proposals_gsn_id_fkey(*),
        arquiteto:sales_team!proposals_arquiteto_id_fkey(*),
        proposal_scope_items(*),
        proposal_macro_scope(*),
        payment_conditions(*)
      `)
      .eq("id", proposalId)
      .single();

    if (propError || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let unitInfo = null;
    if (proposal.clients?.unit_id) {
      const { data } = await supabase.from("unit_info").select("*").eq("id", proposal.clients.unit_id).single();
      unitInfo = data;
    }
    if (!unitInfo) {
      const { data } = await supabase.from("unit_info").select("*").limit(1).maybeSingle();
      unitInfo = data;
    }

    const scopeItems = proposal.proposal_scope_items || [];
    const includedItems = scopeItems.filter((i: any) => i.included);
    const parentItems = includedItems.filter((i: any) => !i.parent_id);
    const childItems = includedItems.filter((i: any) => i.parent_id);

    const templateIds = [...new Set(includedItems.map((i: any) => i.template_id).filter(Boolean))];
    let templateNames: Record<string, string> = {};
    if (templateIds.length > 0) {
      const { data: templates } = await supabase.from("scope_templates").select("id, name").in("id", templateIds);
      templateNames = (templates || []).reduce((acc: any, t: any) => ({ ...acc, [t.id]: t.name }), {});
    }

    const totalAnalystHours = parentItems.reduce((s: number, i: any) => s + Number(i.hours), 0);
    const gpPercentage = Number(proposal.gp_percentage);
    const gpHours = Math.ceil(totalAnalystHours * (gpPercentage / 100));
    const hourlyRate = Number(proposal.hourly_rate);
    const totalHours = totalAnalystHours + gpHours;
    const totalValueNet = totalHours * hourlyRate;
    const taxFactor = unitInfo?.tax_factor || 0;
    const totalValueGross = totalValueNet * (1 + taxFactor / 100);
    const accompAnalyst = Number(proposal.accomp_analyst) || 0;
    const accompGP = Number(proposal.accomp_gp) || 0;
    const accompAnalystHours = Math.ceil(totalAnalystHours * (accompAnalyst / 100));
    const accompGPHours = Math.ceil(gpHours * (accompGP / 100));

    const macroScopeNames = templateIds.map((id: string) => templateNames[id] || "Outros");
    const hasAvulsos = includedItems.some((i: any) => !i.template_id);
    const detailedScope = buildDetailedScope(parentItems, childItems, templateNames);
    const isProjeto = proposal.type === "projeto";

    const data = { proposal, unitInfo, macroScopeNames, detailedScope, totalAnalystHours, gpHours, totalHours, hourlyRate, totalValueNet, totalValueGross, taxFactor, accompAnalystHours, accompGPHours, templateNames, hasAvulsos };

    const html = isProjeto ? generateProjetoHTML(data) : generateBancoDeHorasHTML(data);

    return new Response(JSON.stringify({ html, proposal: { number: proposal.number, totalValue: totalValueNet, totalHours } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Helpers ────────────────────────────────────────────────────────

function buildDetailedScope(parentItems: any[], childItems: any[], templateNames: Record<string, string>) {
  const groups: Record<string, { templateName: string; processes: { description: string; children: { description: string; hours: number }[] }[] }> = {};
  for (const parent of parentItems) {
    const tid = parent.template_id || "_avulso";
    const tname = parent.template_id ? (templateNames[parent.template_id] || "Outros") : "Itens Avulsos";
    if (!groups[tid]) groups[tid] = { templateName: tname, processes: [] };
    const children = childItems.filter((c: any) => c.parent_id === parent.id).sort((a: any, b: any) => a.sort_order - b.sort_order);
    groups[tid].processes.push({ description: parent.description, children: children.map((c: any) => ({ description: c.description, hours: Number(c.hours) })) });
  }
  return Object.values(groups);
}

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

// ─── TOTVS Logo SVG (white) ────────────────────────────────────────

const TOTVS_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 60" fill="white">
  <text x="60" y="42" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="40" letter-spacing="2">TOTVS</text>
  <circle cx="25" cy="30" r="22" fill="none" stroke="white" stroke-width="4"/>
  <path d="M10,30 Q25,10 40,30 Q25,50 10,30Z" fill="white" opacity="0.7"/>
</svg>`;

const TOTVS_LOGO_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50" fill="white" style="height:36px;">
  <text x="45" y="34" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="30" letter-spacing="1">TOTVS</text>
  <circle cx="20" cy="25" r="16" fill="none" stroke="white" stroke-width="3"/>
  <path d="M8,25 Q20,10 32,25 Q20,40 8,25Z" fill="white" opacity="0.7"/>
</svg>`;

// ─── Styles ─────────────────────────────────────────────────────────

function baseStyles() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
    
    :root {
      --totvs-dark: #0f1923;
      --totvs-dark2: #162330;
      --totvs-teal: #00c9eb;
      --totvs-teal-light: #4fc3d8;
      --totvs-cyan: #5ce0f0;
      --totvs-purple: #8b5cf6;
      --totvs-purple-dark: #6d28d9;
      --totvs-lime: #c8e64a;
      --totvs-white: #ffffff;
      --totvs-gray: #e5e7eb;
      --totvs-text: #1e293b;
      --totvs-text-light: #64748b;
    }
    
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: var(--totvs-text); font-size: 11px; line-height: 1.6; margin: 0; padding: 0; }
    
    .page { 
      width: 210mm; min-height: 297mm; 
      padding: 30mm 25mm 35mm 25mm; 
      page-break-before: always; 
      position: relative;
    }
    .page:first-child { page-break-before: auto; }
    
    /* Cover pages have no padding */
    .cover-page { padding: 0; overflow: hidden; }
    
     h1 { color: var(--totvs-teal); font-size: 20px; font-weight: 700; margin: 28px 0 14px; padding-bottom: 8px; border-bottom: 2px solid var(--totvs-teal); }
     h2 { color: var(--totvs-teal); font-size: 14px; font-weight: 700; margin: 20px 0 8px; }
     h3 { color: var(--totvs-teal); font-size: 12px; font-weight: 600; margin: 14px 0 6px; }
     p { margin: 6px 0; }
     
     table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 11px; }
     th { background: var(--totvs-teal); color: white; padding: 10px 12px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    
    .info-table td { border: none; padding: 5px 12px; }
    .info-table td:first-child { color: var(--totvs-text-light); width: 200px; font-weight: 500; }
    .info-table td:last-child { font-weight: 600; color: var(--totvs-text); }
    
    .scope-table th { text-align: left; }
    
    .signature-table { margin-top: 40px; }
    .signature-table td { border: none; padding: 20px; vertical-align: top; width: 50%; }
    
    ul { padding-left: 20px; }
    ul li { margin-bottom: 6px; }
    
    .page-footer {
      position: absolute; bottom: 15mm; left: 25mm; right: 25mm;
      font-size: 8px; color: var(--totvs-text-light); 
      text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px;
    }
    .page-footer p { margin: 1px 0; }
    
    @media print { 
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @media screen { 
      body { background: #94a3b8; }
      .page { margin: 20px auto; box-shadow: 0 4px 24px rgba(0,0,0,0.2); background: white; } 
      .cover-page { background: transparent; }
    }
  `;
}

// ─── Cover Page (Page 1) ────────────────────────────────────────────

function coverPage() {
  return `<div class="page cover-page" style="background: #0d1b24; display:flex; flex-direction:column; justify-content:space-between; align-items:stretch;">
    <div style="position:absolute; top:0; left:0; right:0; bottom:0; overflow:hidden;">
      <svg viewBox="0 0 800 1130" style="position:absolute; top:0; left:0; width:100%; height:100%;" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="tealMain" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1a6a7a;stop-opacity:1" />
            <stop offset="35%" style="stop-color:#1f8090;stop-opacity:1" />
            <stop offset="65%" style="stop-color:#2a95a5;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#35b0c0;stop-opacity:1" />
          </linearGradient>
          <linearGradient id="cyanHighlight" x1="30%" y1="0%" x2="70%" y2="100%">
            <stop offset="0%" style="stop-color:#50e0f0;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#70ecfc;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#90f4ff;stop-opacity:0.9" />
          </linearGradient>
          <linearGradient id="innerShadow" x1="40%" y1="20%" x2="60%" y2="80%">
            <stop offset="0%" style="stop-color:#0d1b24;stop-opacity:0.7" />
            <stop offset="100%" style="stop-color:#0a1520;stop-opacity:0.5" />
          </linearGradient>
          <linearGradient id="tealDeep" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" style="stop-color:#155565;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#1a7585;stop-opacity:1" />
          </linearGradient>
        </defs>
        <!-- Main large teal shape - flowing from right side curving down-left -->
        <path d="M800,100 Q750,80 680,130 Q580,200 500,320 Q400,480 350,600 Q280,760 300,880 Q320,980 380,1060 Q430,1130 500,1130 L800,1130Z" fill="url(#tealMain)"/>
        <!-- Bright cyan edge highlight - outer edge of shape -->
        <path d="M800,90 Q745,70 670,125 Q565,195 490,315 Q385,478 335,598 Q265,760 285,880 Q305,982 365,1062 Q415,1130 485,1130" fill="none" stroke="url(#cyanHighlight)" stroke-width="8"/>
        <!-- Cyan fill band along edge -->
        <path d="M800,90 Q745,70 670,125 Q565,195 490,315 Q385,478 335,598 Q265,760 285,880 Q305,982 365,1062 Q415,1130 485,1130 L500,1130 Q430,1130 380,1060 Q320,980 300,880 Q280,760 350,600 Q400,480 500,320 Q580,200 680,130 Q750,80 800,100Z" fill="url(#cyanHighlight)" opacity="0.4"/>
        <!-- Dark inner shadow within the shape -->
        <path d="M800,200 Q760,180 710,220 Q630,290 570,400 Q480,560 440,680 Q390,810 410,920 Q430,1010 480,1080 Q510,1130 550,1130 L800,1130Z" fill="url(#innerShadow)"/>
        <!-- Deeper teal accent on right -->
        <path d="M800,350 Q770,330 740,360 Q690,420 650,520 Q600,650 590,770 Q580,880 610,970 Q640,1050 690,1100 Q720,1130 760,1130 L800,1130Z" fill="url(#tealDeep)" opacity="0.4"/>
      </svg>
    </div>
    
    <div style="position:relative; z-index:1; padding: 80px 60px 0;">
      <h1 style="color:white; font-size:46px; font-weight:900; border:none; margin:0; line-height:1.1; letter-spacing:-0.5px; font-family:'Arial Black','Helvetica Neue',Arial,sans-serif;">PROPOSTA<br/>COMERCIAL</h1>
    </div>
    
    <div style="position:relative; z-index:1; padding: 0 45px 40px; text-align:left;">
      <div style="display:flex; align-items:center; gap:18px;">
        <svg viewBox="0 0 100 100" style="width:80px; height:80px;" fill="white">
          <path d="M50,5 C25,5 5,22 5,43 C5,56 12,67 23,73 L50,90 L77,73 C88,67 95,56 95,43 C95,22 75,5 50,5Z M50,12 C71,12 88,26 88,43 C88,54 82,63 73,68 L50,82 L27,68 C18,63 12,54 12,43 C12,26 29,12 50,12Z"/>
          <path d="M28,43 Q50,22 72,43 Q50,64 28,43Z"/>
        </svg>
        <div style="font-family:'Arial Black','Helvetica Neue',Arial,sans-serif; font-size:64px; font-weight:900; color:white; letter-spacing:6px; line-height:1;">TOTVS</div>
      </div>
    </div>
  </div>`;
}

// ─── Sub-Cover Page (Page 2) ────────────────────────────────────────

function subCoverPage() {
  return `<div class="page cover-page" style="background: var(--totvs-dark); display:flex; flex-direction:column; justify-content:space-between;">
    <div style="position:absolute; top:0; left:0; right:0; bottom:0; overflow:hidden;">
      <svg viewBox="0 0 800 1130" style="position:absolute; top:0; left:0; width:100%; height:100%;" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="darkTeal2" x1="0%" y1="20%" x2="100%" y2="80%">
            <stop offset="0%" style="stop-color:#0f2a35;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#1a4a5a;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#1a5a6a;stop-opacity:0.8" />
          </linearGradient>
          <linearGradient id="darkTealEdge2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1a6a7a;stop-opacity:0.4" />
            <stop offset="100%" style="stop-color:#2a7a8a;stop-opacity:0.3" />
          </linearGradient>
        </defs>
        <path d="M350,0 Q250,100 300,300 Q370,550 280,750 Q200,950 250,1130 L800,1130 L800,0Z" fill="url(#darkTeal2)" opacity="0.5"/>
        <path d="M340,0 Q240,100 290,300 Q360,550 270,750 Q190,950 240,1130" fill="none" stroke="url(#darkTealEdge2)" stroke-width="3"/>
        <path d="M500,0 Q400,200 450,450 Q520,700 420,900 Q370,1050 400,1130 L800,1130 L800,0Z" fill="#0f2530" opacity="0.3"/>
      </svg>
    </div>
    
    <div style="position:relative; z-index:1; padding:100px 60px 0; flex:1; display:flex; flex-direction:column; justify-content:flex-start;">
      <p style="font-size:40px; font-weight:800; color:white; line-height:1.25; margin:0; font-family:'Inter','Arial',sans-serif;">
        Parabéns!<br/>
        Você está fazendo<br/>
        negócio com a<br/>
        <span style="color:var(--totvs-lime);">maior empresa</span><br/>
        <span style="color:var(--totvs-lime);">de tecnologia</span><br/>
        <span style="color:var(--totvs-lime);">do Brasil!</span>
      </p>
    </div>
    
    <div style="position:relative; z-index:1; padding: 0 50px 45px; text-align:right;">
      <div style="display:inline-flex; align-items:center; gap:8px;">
        <svg viewBox="0 0 50 50" style="width:32px; height:32px;" fill="white">
          <path d="M25,3 C13,3 4,11.5 4,22 C4,29 7.8,35 13.3,38.5 L25,46 L36.7,38.5 C42.2,35 46,29 46,22 C46,11.5 37,3 25,3Z M25,6.5 C35,6.5 43,13.5 43,22 C43,27.8 39.8,32.8 35,35.7 L25,42 L15,35.7 C10.2,32.8 7,27.8 7,22 C7,13.5 15,6.5 25,6.5Z" fill="white" opacity="0.9"/>
          <path d="M15,22 Q25,10 35,22 Q25,34 15,22Z" fill="white" opacity="0.8"/>
        </svg>
        <div style="text-align:left;">
          <div style="font-family:'Arial Black',Arial,sans-serif; font-size:22px; font-weight:900; color:white; letter-spacing:2px; line-height:1;">TOTVS</div>
          <div style="font-size:9px; font-weight:700; color:white; letter-spacing:4px; margin-top:0px;">LESTE</div>
        </div>
      </div>
    </div>
  </div>`;
}

// ─── Title Page (Page 3) ────────────────────────────────────────────

function titlePage(data: any) {
  const { proposal, unitInfo } = data;
  const client = proposal.clients;
  const esn = proposal.esn;
  const gsn = proposal.gsn;
  const arq = proposal.arquiteto;
  const isProjeto = proposal.type === "projeto";
  const title = isProjeto ? "Proposta de Implantação" : "Proposta de Banco de Horas";

  return `<div class="page cover-page" style="background: var(--totvs-dark); display:flex; flex-direction:column;">
    <div style="position:absolute; top:0; left:0; right:0; bottom:0; overflow:hidden;">
      <svg viewBox="0 0 800 1130" style="position:absolute; top:0; left:0; width:100%; height:100%;" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="purpleGrad3" x1="30%" y1="0%" x2="100%" y2="60%">
            <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#9b6dfa;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#b794ff;stop-opacity:1" />
          </linearGradient>
          <linearGradient id="purpleBot3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#9b6dfa;stop-opacity:1" />
          </linearGradient>
        </defs>
        <!-- Large purple shape top -->
        <path d="M300,0 Q200,80 250,250 Q330,500 550,500 Q750,490 800,350 L800,0Z" fill="url(#purpleGrad3)"/>
        <!-- Bottom purple wave -->
        <path d="M800,600 Q650,580 500,650 Q300,750 250,900 Q200,1000 300,1130 L800,1130Z" fill="url(#purpleBot3)"/>
        <!-- Dark overlay for depth -->
        <path d="M800,700 Q680,680 550,730 Q380,810 330,930 Q290,1030 360,1130 L800,1130Z" fill="var(--totvs-dark)" opacity="0.3"/>
      </svg>
    </div>
    
    <div style="position:relative; z-index:1; padding:45px 50px 0;">
      <div style="display:flex; align-items:center; gap:8px;">
        <svg viewBox="0 0 50 50" style="width:30px; height:30px;" fill="white">
          <path d="M25,3 C13,3 4,11.5 4,22 C4,29 7.8,35 13.3,38.5 L25,46 L36.7,38.5 C42.2,35 46,29 46,22 C46,11.5 37,3 25,3Z M25,6.5 C35,6.5 43,13.5 43,22 C43,27.8 39.8,32.8 35,35.7 L25,42 L15,35.7 C10.2,32.8 7,27.8 7,22 C7,13.5 15,6.5 25,6.5Z" fill="white" opacity="0.9"/>
          <path d="M15,22 Q25,10 35,22 Q25,34 15,22Z" fill="white" opacity="0.8"/>
        </svg>
        <div>
          <div style="font-family:'Arial Black',Arial,sans-serif; font-size:20px; font-weight:900; color:white; letter-spacing:2px; line-height:1;">TOTVS</div>
          <div style="font-size:9px; font-weight:700; color:white; letter-spacing:4px; margin-top:0px; margin-left:1px;">LESTE</div>
        </div>
      </div>
    </div>
    
    <div style="position:relative; z-index:1; padding:0 60px; flex:1; display:flex; flex-direction:column; justify-content:center; margin-top:80px;">
      <h1 style="color:white; font-size:30px; font-weight:800; border:none; margin:0 0 36px; line-height:1.15; font-family:'Inter','Arial',sans-serif;">${title}</h1>
      
      <h2 style="color:white; font-size:16px; font-weight:700; margin:0 0 14px;">Informações gerais</h2>
      <div style="color:rgba(255,255,255,0.9); font-size:13px; line-height:1.9;">
        <p style="margin:2px 0;">Proposta número: <strong>${proposal.number}</strong></p>
        <p style="margin:2px 0;">Linha de Produto: <strong>${proposal.product}</strong></p>
        <p style="margin:2px 0;">Cliente: <strong>${client?.code || ""} - ${client?.name || "—"}</strong></p>
        <p style="margin:2px 0;">Data de Validade: <strong>${fmtDate(proposal.date_validity)}</strong></p>
        <p style="margin:2px 0;">Data de emissão: <strong>${fmtDate(proposal.created_at)}</strong></p>
        <p style="margin:2px 0;">Unidade TOTVS: <strong>${unitInfo?.name || "—"}</strong></p>
      </div>
      
      <h2 style="color:white; font-size:16px; font-weight:700; margin:28px 0 14px;">Nossa equipe</h2>
      <div style="color:rgba(255,255,255,0.9); font-size:13px; line-height:1.9;">
        <p style="margin:2px 0;">Gerente de vendas: <strong>${gsn?.code || ""} - ${gsn?.name || "—"}</strong></p>
        <p style="margin:2px 0;">Executivo de vendas: <strong>${esn?.code || ""} - ${esn?.name || "—"}</strong></p>
        <p style="margin:2px 0;">Arquiteto de solução: <strong>${arq?.code || ""} - ${arq?.name || "—"}</strong></p>
      </div>
    </div>
  </div>`;
}

// ─── Footer ─────────────────────────────────────────────────────────

function footerHTML(unitInfo: any) {
  return `<div class="page-footer">
    <p>Este documento é propriedade da TOTVS. Todos os direitos reservados. ©</p>
    <p>${unitInfo?.name || "TOTVS Leste"} · ${unitInfo?.cnpj || ""} · ${unitInfo?.phone || ""}</p>
  </div>`;
}

// ─── Content Pages ──────────────────────────────────────────────────

function contractIntro(data: any) {
  const { proposal, unitInfo } = data;
  const client = proposal.clients;
  const isProjeto = proposal.type === "projeto";
  const title = isProjeto ? "Proposta Projeto Implantação" : "Proposta Banco de Horas";

  return `<div class="page">
    <h1>${title}</h1>
    <p>De um lado, <strong>EDUCO SERVIÇOS LTDA</strong> com sede na ${unitInfo?.address || "—"}, inscrita no CNPJ/MF sob o n° ${unitInfo?.cnpj || "—"}, Inscrição Estadual: Isento, neste ato representada de acordo com seu estatuto/contrato social, doravante denominada "TOTVS LESTE", e, de outro lado, CLIENTE <strong>${client?.name || "—"}</strong>, com sede na ${client?.address || "—"}, inscrito no CNPJ/MF sob n.° ${client?.cnpj || "—"}, Inscrição Estadual n.° ${client?.state_registration || "—"}, Telefone ${client?.phone || "—"}, Contato ${client?.contact || "—"}, email: ${client?.email || "—"}, neste ato representada de acordo com seu contrato social, doravante denominada "Cliente".</p>
    <h2>Introdução</h2>
    ${isProjeto
      ? `<p>A TOTVS oferece nesta proposta o serviço de implantação, conforme descrito no tópico "Escopo de Serviços" abaixo com o objetivo de tornar operacional a solução TOTVS descrita no tópico Escopo da Solução. Colocamo-nos à disposição para esclarecer qualquer dúvida decorrente a sua interpretação e para avaliar possíveis alterações que sejam essenciais ao seu negócio.</p>`
      : `<p>A TOTVS apresenta nesta proposta a prestação de serviços na modalidade de Banco de Horas (Time & Materials), com o objetivo de apoiar o Cliente em suas demandas sistêmicas e operacionais, conforme as diretrizes e necessidades definidas exclusivamente por ele. Colocamo-nos à disposição para esclarecer qualquer dúvida sobre este modelo de atendimento.</p>`
    }
    ${footerHTML(unitInfo)}
  </div>`;
}

function scopePage(data: any) {
  const { proposal, unitInfo, macroScopeNames } = data;
  const isProjeto = proposal.type === "projeto";

  let macroTable = `<table class="scope-table"><thead><tr><th>Macro Escopo</th></tr></thead><tbody>`;
  for (const name of macroScopeNames) {
    macroTable += `<tr><td>${name}</td></tr>`;
  }
  macroTable += `</tbody></table>`;

  const outOfScope = isProjeto ? `
    <h2>1.2 Itens Fora de Escopo</h2>
    <ul>
      <li>Modelagem, reengenharia ou revisão de processos de negócio (Business Process Reengineering).</li>
      <li>Saneamento, limpeza, correção, filtro ou otimização dos dados dos sistemas atuais (legados).</li>
      <li>Migração de dados de movimentação histórica (apenas saldos e cadastros previstos no escopo serão migrados).</li>
      <li>Apoio, capacitação ou instalação de sistema operacional, banco de dados, configuração de servidores, rede e infraestrutura.</li>
      <li>Manutenção, administração e atualizações do ambiente (tuning, dimensionamento), bem como rotinas de backup.</li>
      <li>Desenvolvimento de quaisquer interfaces, rotinas específicas ou customizações ao escopo contratado.</li>
      <li>Desenvolvimento de relatórios ou consultas customizadas.</li>
    </ul>` : "";

  return `<div class="page">
    <h1>1. Definições</h1>
    <p>A TOTVS tem o objetivo de tornar operacional o "Escopo da Solução" conforme está descrito na "Metodologia de Implantação". Estamos à disposição para esclarecer qualquer dúvida decorrente de sua interpretação e para avaliar possíveis alterações que sejam essenciais ao seu negócio.</p>
    <h2>1.1 Escopo da Solução</h2>
    ${macroTable}
    ${outOfScope}
    ${footerHTML(unitInfo)}
  </div>`;
}

function investmentPage(data: any) {
  const { proposal, unitInfo, totalAnalystHours, gpHours, totalHours, hourlyRate, totalValueNet, totalValueGross, taxFactor, accompAnalystHours, accompGPHours } = data;
  const isProjeto = proposal.type === "projeto";
  const payments = proposal.payment_conditions || [];
  const desc = proposal.description || (isProjeto ? "Projeto de Implantação" : "Banco de Horas");

  const paymentRows = payments.sort((a: any, b: any) => a.installment - b.installment).map((p: any) =>
    `<tr><td style="text-align:center">${p.installment}ª</td><td style="text-align:center">${fmtDate(p.due_date)}</td><td style="text-align:right">R$ ${fmt(Number(p.amount))}</td></tr>`
  ).join("");

  const accompSection = isProjeto ? `
    <h2>4.3. Operação Assistida (Acompanhamento após Go-Live)</h2>
    <p>O período de Operação Assistida (Hypercare) é estritamente limitado ao saldo de horas contratado e tem como objetivo o apoio direto aos usuários na transição para o ambiente produtivo real.</p>
    <table>
      <thead><tr><th>Serviço Contratado</th><th>Quantidade de Horas</th></tr></thead>
      <tbody>
        <tr><td>Analista de Implantação</td><td style="text-align:center">${accompAnalystHours}h</td></tr>
        <tr><td>Coordenador de Projeto</td><td style="text-align:center">${accompGPHours}h</td></tr>
      </tbody>
    </table>` : "";

  const additionalSection = `
    <h2>${isProjeto ? "4.4" : "4.3"}. Valor Hora Adicional</h2>
    <p>Caso sejam necessárias atividades adicionais não contempladas no escopo contratado, os seguintes valores serão aplicados:</p>
    <table>
      <thead><tr><th>Serviço Contratado</th><th>Valor Hora (Líquido)</th></tr></thead>
      <tbody>
        <tr><td>Analista de Implantação</td><td style="text-align:right">R$ ${fmt(Number(proposal.additional_analyst_rate))}</td></tr>
        <tr><td>Coordenador de Projeto</td><td style="text-align:right">R$ ${fmt(Number(proposal.additional_gp_rate))}</td></tr>
      </tbody>
    </table>`;

  const negotiationSection = proposal.negotiation ? `
    <h2>Negociação Específica</h2>
    <p>${proposal.negotiation}</p>` : "";

  return `<div class="page">
    <h1>4. Investimento</h1>
    <h2>${isProjeto ? "4.1. Projeto Contratado" : "4.1. Recursos Contratados"}</h2>
    <table>
      <thead><tr><th>Descrição</th>${!isProjeto ? '<th>Quantidade de Horas</th>' : ''}<th>Valor total (Líquido)</th></tr></thead>
      <tbody>
        ${isProjeto
          ? `<tr><td>${desc}</td><td style="text-align:right">R$ ${fmt(totalValueNet)}</td></tr>`
          : `<tr><td>Analista de Implantação</td><td style="text-align:center">${totalAnalystHours}h</td><td style="text-align:right">R$ ${fmt(totalAnalystHours * hourlyRate)}</td></tr>
             <tr><td>Coordenador de Projeto</td><td style="text-align:center">${gpHours}h</td><td style="text-align:right">R$ ${fmt(gpHours * hourlyRate)}</td></tr>`
        }
      </tbody>
      ${!isProjeto ? `<tfoot><tr><th>Total</th><th style="text-align:center">${totalHours}h</th><th style="text-align:right">R$ ${fmt(totalValueNet)}</th></tr></tfoot>` : ''}
    </table>

    <h2>4.2. Condições de Pagamento</h2>
    ${payments.length > 0 ? `
    <table>
      <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor (Líquido)</th></tr></thead>
      <tbody>${paymentRows}</tbody>
    </table>` : "<p>Condições de pagamento a definir.</p>"}

    ${accompSection}
    ${additionalSection}
    ${negotiationSection}
    ${footerHTML(unitInfo)}
  </div>`;
}

function expensesPage(data: any) {
  const { proposal, unitInfo } = data;

  return `<div class="page">
    <h1>5. Despesas Acessórias</h1>
    <p>Fica estabelecido que, para a execução de serviços nas dependências do Cliente, este deverá arcar com as despesas e logísticas descritas a seguir:</p>
    <ul>
      <li><strong>ALIMENTAÇÃO:</strong> Será cobrado o valor diário de R$ 70,00 por profissional alocado, faturado posteriormente via Nota de Débito.</li>
      <li><strong>HOSPEDAGEM:</strong> A reserva e o custeio integral das despesas de hospedagem são de responsabilidade do Cliente. Acomodação individual em hotel de boa qualidade.</li>
      <li><strong>ESTACIONAMENTO:</strong> Quando houver necessidade, os custos ficarão sob responsabilidade do Cliente.</li>
      <li><strong>LOGÍSTICA E DESLOCAMENTO (TRASLADO):</strong>
        <ul>
          <li>Traslado Viagem: ${proposal.travel_trip_hours || 4} horas (ida e volta), da cidade de origem (${unitInfo?.city || "—"}) até o Cliente.</li>
          <li>Traslado Local: ${proposal.travel_local_hours || 1} horas (ida e volta), entre hotel/base e sede do Cliente.</li>
          <li>Valor-Hora de Traslado: R$ ${fmt(Number(proposal.travel_hourly_rate || 250))}</li>
        </ul>
      </li>
    </ul>
    ${footerHTML(unitInfo)}
  </div>`;
}

function legalPage(data: any) {
  const { proposal, unitInfo } = data;

  return `<div class="page">
    <h1>6. Condições Comerciais e Legais</h1>
    <p>Os valores descritos na proposta são líquidos e deverão ser acrescidos de todos os encargos fiscais e tributários incidentes, que serão arcados pelo Cliente.</p>
    <ul>
      <li><strong>Reequilíbrio Econômico:</strong> Caso os custos se elevem em razão de mudanças relevantes no mercado, as Partes concordam na revisão dos valores.</li>
      <li><strong>Atualização Monetária:</strong> Os preços serão reajustados anualmente pela variação positiva do IPCA/IBGE.</li>
      <li><strong>Pagamentos em Atraso:</strong> Atrasos implicarão multa de mora de 2%, juros de 1% ao mês e correção pelo IPCA/IBGE.</li>
    </ul>

    <h1>7. Termo de Aceite ao Contrato</h1>
    <p>Documentos aplicáveis e ciência prévia: O Cliente declara ter lido e estar de acordo com as disposições de todos os documentos que integrarão essa Proposta.</p>
    <p>Condições Específicas de Serviços: <a href="https://info.totvs.com/hubfs/AnexoContratoServicos.v2020.pdf" style="color:var(--totvs-teal);">info.totvs.com/hubfs/AnexoContratoServicos.v2020.pdf</a></p>
    <p style="margin-top:16px;">${fmtDate(proposal.created_at)}</p>

    <h2>ASSINATURAS DOS REPRESENTANTES LEGAIS</h2>
    <table class="signature-table">
      <tr>
        <td>
          <strong>${proposal.clients?.name || "CLIENTE"}</strong><br/>
          Ass.:____________________________<br/>
          Nome:___________________________<br/>
          Cargo:___________________________<br/>
          RG:_____________________________
        </td>
        <td>
          <strong>EDUCO SERVIÇOS LTDA</strong><br/>
          Ass.:____________________________<br/>
          Nome:___________________________<br/>
          Cargo:___________________________<br/>
          RG:_____________________________
        </td>
      </tr>
    </table>
    ${footerHTML(unitInfo)}
  </div>`;
}

function summaryPage(data: any) {
  const { proposal, unitInfo, totalHours, totalValueNet } = data;
  const payments = proposal.payment_conditions || [];
  const firstPayment = payments.sort((a: any, b: any) => a.installment - b.installment)[0];

  return `<div class="page">
    <h1>FOLHA RESUMO</h1>
    <h2>EMPRESAS / FILIAIS</h2>
    <table class="info-table">
      <tr><td>Quantidade de empresas que fazem parte do escopo</td><td>${proposal.num_companies || 1}</td></tr>
    </table>

    <h2>DESPESAS DE ATENDIMENTO</h2>
    <table class="info-table">
      <tr><td>ALIMENTAÇÃO:</td><td>R$ 80,00</td></tr>
      <tr><td>HOSPEDAGEM:</td><td>Por conta do cliente</td></tr>
      <tr><td>ESTACIONAMENTO:</td><td>Por conta do cliente</td></tr>
      <tr><td>TRASLADO VIAGEM:</td><td>${proposal.travel_trip_hours || 4} HORAS</td></tr>
      <tr><td>VALOR HORA TRASLADO:</td><td>R$ ${fmt(Number(proposal.travel_hourly_rate || 250))}</td></tr>
    </table>

    <h2>VALORES</h2>
    <table class="info-table">
      <tr><td>CONDIÇÃO DE PAGAMENTO:</td><td>${payments.length} Parcelas</td></tr>
      <tr><td>PRIMEIRO VENCIMENTO:</td><td>${firstPayment ? fmtDate(firstPayment.due_date) : "—"}</td></tr>
      <tr><td>TOTAL SEM IMPOSTOS:</td><td>R$ ${fmt(totalValueNet)}</td></tr>
    </table>

    <h2>DE ACORDO DO CLIENTE</h2>
    <table class="signature-table">
      <tr>
        <td>Assinatura:____________________________</td>
        <td>Nome:_______________________________</td>
      </tr>
      <tr>
        <td>Cargo:______________________________</td>
        <td>RG:________________________________</td>
      </tr>
    </table>
    ${footerHTML(unitInfo)}
  </div>`;
}

function detailedScopeAnnex(data: any) {
  const { unitInfo, detailedScope } = data;

  let html = `<div class="page">
    <h1>Anexo - Escopo Detalhado</h1>`;

  for (const group of detailedScope) {
    html += `<h2>${group.templateName}</h2>`;
    html += `<table class="scope-table">
      <thead><tr><th>Processo</th><th style="width:60%">Resumo</th><th style="width:60px;text-align:center">Escopo</th></tr></thead>
      <tbody>`;

    for (const proc of group.processes) {
      html += `<tr style="background:#e2e8f0;font-weight:600"><td>${proc.description}</td><td></td><td style="text-align:center">Sim</td></tr>`;
      for (const child of proc.children) {
        html += `<tr><td style="padding-left:24px">${child.description}</td><td></td><td style="text-align:center">Sim</td></tr>`;
      }
    }

    html += `</tbody></table>`;
  }

  html += footerHTML(unitInfo);
  html += `</div>`;
  return html;
}

function metodologiaPage(unitInfo: any) {
  return `<div class="page">
    <h1>2. Metodologia e Governança do Projeto</h1>
    <h2>2.1 MIT - Metodologia de Implantação TOTVS</h2>
    <p>A metodologia de Projetos TOTVS compreende os grupos de tarefas relacionadas ao Gerenciamento do Projeto, organizadas por Fases, definindo assim um fluxo natural da condução do projeto de forma estruturada e padronizada.</p>
    <h3>Fase 1 - Preparação:</h3>
    <p>É o alinhamento mais aprofundado das necessidades e expectativas, com definição do time do projeto e partes interessadas, revisão e confirmação do escopo, dos prazos e da estratégia em geral.</p>
    <h3>Fase 2 - Refinamento:</h3>
    <p>É o desenho efetivo da solução a ser entregue, sendo revisto os requisitos sobre a análise dos processos "TO BE" e eliminação de gaps do escopo e/ou processo.</p>
    <h3>Fase 3 - Realização:</h3>
    <p>É a construção de fato sobre o desenho detalhado aprovado na fase anterior. A construção e testes são baseadas em Sprints com base no backlog.</p>
    <h3>Fase 4 - Operação:</h3>
    <p>É a execução das atividades para entrada em produção e o período de Acompanhamento ou Operação Assistida do sistema logo após o GO LIVE!</p>
    <h2>2.2 Aderência ao Padrão (Fit-to-Standard)</h2>
    <p>Todos os módulos, rotinas e processos listados no "Escopo da Solução" desta proposta serão atendidos e parametrizados de acordo com o funcionamento nativo e padrão (Standard) do sistema TOTVS.</p>
    ${footerHTML(unitInfo)}
  </div>`;
}

function premissasPage(unitInfo: any) {
  return `<div class="page">
    <h1>3. Premissas e Regras Operacionais</h1>
    <h2>3.1 Responsabilidades do Cliente</h2>
    <ul>
      <li><strong>Saneamento e Carga de Dados:</strong> Todo o trabalho de saneamento, de-para e validação de dados dos sistemas legados é de exclusiva responsabilidade do Cliente.</li>
      <li><strong>Disponibilidade da Equipe:</strong> O Cliente compromete-se a disponibilizar Usuários-Chave com autonomia para tomada de decisão e validação de processos.</li>
      <li><strong>Infraestrutura:</strong> O Cliente deverá garantir a infraestrutura e acessos sistêmicos necessários.</li>
    </ul>
    <h2>3.2 Regras Operacionais</h2>
    <ul>
      <li><strong>Horário de Atendimento:</strong> De segunda a sexta-feira, das 09h00 às 18h00. Fora deste horário: acréscimo de 50%. Sábados/domingos/feriados: acréscimo de 100%.</li>
      <li><strong>Cancelamento/Remanejamento de Agenda:</strong> Notificação mínima de 48 horas úteis.</li>
      <li><strong>Aprovação de Horas (OS-e):</strong> O Cliente terá prazo de 48 horas para aprovar ou contestar. Após este prazo: aceite tácito.</li>
    </ul>
    ${footerHTML(unitInfo)}
  </div>`;
}

function bancoDeHorasNaturezaPage(data: any) {
  const { unitInfo, macroScopeNames } = data;
  let macroTable = `<table class="scope-table"><thead><tr><th>CONSIDERAÇÕES / PROCESSOS</th></tr></thead><tbody>`;
  for (const name of macroScopeNames) {
    macroTable += `<tr><td>${name}</td></tr>`;
  }
  macroTable += `</tbody></table>`;

  return `<div class="page">
    <h1>1. Natureza dos Serviços e Direcionamento de Escopo</h1>
    <h2>1.1. Modelo de Contratação (Banco de Horas)</h2>
    <p>Esta proposta tem por objetivo disponibilizar ao Cliente um Banco de Horas de profissionais especializados, a serem consumidas sob demanda. Por se tratar de uma modalidade por tempo incorrido (Time & Materials), o compromisso contratual refere-se à disponibilidade e alocação do esforço técnico (horas), e não à entrega de um escopo fechado.</p>
    <h2>1.2. Expectativa de Atuação (Estimativa)</h2>
    <p>O volume de horas provisionado nesta proposta foi dimensionado como uma estimativa inicial para apoiar as seguintes frentes macro de trabalho:</p>
    ${macroTable}
    ${footerHTML(unitInfo)}
  </div>`;
}

function bancoRegrasPage(unitInfo: any) {
  return `<div class="page">
    <h1>2. Papéis e Responsabilidades</h1>
    <h2>2.1. Responsabilidades do Cliente</h2>
    <p>O Cliente atua como o gestor direto das atividades. É de exclusiva responsabilidade do Cliente a definição, priorização, planejamento, validação de entregas e gestão das atividades.</p>
    <h2>2.2. Responsabilidades da Equipe TOTVS LESTE</h2>
    <ul>
      <li><strong>Analista de Implantação / Consultor:</strong> Profissional técnico responsável pela execução sistêmica das atividades solicitadas pelo Cliente.</li>
      <li><strong>Analista de Alocação e Recursos:</strong> Facilitador operacional (Backoffice).</li>
      <li><strong>Isenção de Gestão (PMO):</strong> A TOTVS LESTE não assume o papel de Gerenciamento de Projetos neste contrato.</li>
    </ul>
    <h1>3. Regras Operacionais e Acompanhamento</h1>
    <h2>3.1. Agendamento e Execução</h2>
    <ul>
      <li>Solicitação de agendas: antecedência mínima de 48 horas úteis.</li>
      <li>Cancelamentos fora do prazo: faturamento integral das horas reservadas.</li>
      <li>Horário de atendimento: dias úteis, 09h00 às 18h00. Fora do horário: acréscimo de 50%. Fins de semana/feriados: 100%.</li>
    </ul>
    <h2>3.2. Aprovação de Horas (OS-e)</h2>
    <p>O Cliente terá prazo máximo de 48 horas para aprovar ou contestar a OS-e. Decorrido o prazo: aceite tácito.</p>
    ${footerHTML(unitInfo)}
  </div>`;
}

// ─── Generators ─────────────────────────────────────────────────────

function generateProjetoHTML(data: any) {
  const { proposal } = data;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Proposta ${proposal.number}</title><style>${baseStyles()}</style></head><body>
    ${coverPage()}
    ${subCoverPage()}
    ${titlePage(data)}
    ${contractIntro(data)}
    ${scopePage(data)}
    ${metodologiaPage(data.unitInfo)}
    ${premissasPage(data.unitInfo)}
    ${investmentPage(data)}
    ${expensesPage(data)}
    ${legalPage(data)}
    ${summaryPage(data)}
    ${detailedScopeAnnex(data)}
  </body></html>`;
}

function generateBancoDeHorasHTML(data: any) {
  const { proposal } = data;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Proposta ${proposal.number}</title><style>${baseStyles()}</style></head><body>
    ${coverPage()}
    ${subCoverPage()}
    ${titlePage(data)}
    ${contractIntro(data)}
    ${bancoDeHorasNaturezaPage(data)}
    ${bancoRegrasPage(data.unitInfo)}
    ${investmentPage(data)}
    ${expensesPage(data)}
    ${legalPage(data)}
  </body></html>`;
}
