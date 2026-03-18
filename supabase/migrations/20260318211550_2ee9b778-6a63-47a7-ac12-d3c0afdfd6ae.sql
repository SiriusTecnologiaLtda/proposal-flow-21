
-- WhatsApp configuration table
CREATE TABLE public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  twilio_phone_number text DEFAULT '',
  ai_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  ai_system_prompt text DEFAULT 'Você é um assistente comercial da TOTVS Leste. Ajude vendedores a consultar propostas, histórico e valores. Quando solicitado, colete informações para gerar novas propostas.',
  welcome_message text DEFAULT 'Olá! Sou o assistente de propostas da TOTVS Leste. Posso ajudar com: consultar propostas, verificar valores e histórico, ou iniciar a geração de uma nova proposta. Como posso ajudar?',
  max_context_messages integer NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view whatsapp config" ON public.whatsapp_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage whatsapp config" ON public.whatsapp_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default config row
INSERT INTO public.whatsapp_config (id) VALUES (gen_random_uuid());

-- WhatsApp messages / conversation history
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound',
  message_text text NOT NULL,
  ai_response text,
  twilio_sid text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view whatsapp messages" ON public.whatsapp_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service can insert whatsapp messages" ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger for updated_at on config
CREATE TRIGGER update_whatsapp_config_updated_at BEFORE UPDATE ON public.whatsapp_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
