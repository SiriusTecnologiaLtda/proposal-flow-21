import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search, Building2 } from "lucide-react";

interface Props {
  value: string | null;
  displayValue?: string;
  onChange: (clientId: string | null, clientName: string) => void;
  placeholder?: string;
}

export function SearchableClientSelect({ value, displayValue, onChange, placeholder = "Buscar cliente..." }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-lookup", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, cnpj, code")
        .or(`name.ilike.%${search}%,cnpj.ilike.%${search}%,code.ilike.%${search}%`)
        .order("name")
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedLabel = displayValue || (value ? "Cliente vinculado" : "");

  if (value && selectedLabel) {
    return (
      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-background text-sm">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="truncate flex-1">{selectedLabel}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={() => onChange(null, "")}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => search.length >= 2 && setOpen(true)}
          placeholder={placeholder}
          className="pl-9 text-sm"
        />
      </div>
      {open && clients.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                onChange(c.id, c.name);
                setSearch("");
                setOpen(false);
              }}
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground ml-2">{c.cnpj}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
