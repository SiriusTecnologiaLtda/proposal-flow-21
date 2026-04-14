import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search, MapPin, Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

interface Props {
  value: string | null;
  displayValue?: string;
  onChange: (unitId: string | null, unitName: string) => void;
  placeholder?: string;
}

export function SearchableUnitSelect({ value, displayValue, onChange, placeholder = "Buscar unidade TOTVS..." }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: units = [], isFetching } = useQuery({
    queryKey: ["units-lookup", debouncedSearch],
    enabled: debouncedSearch.trim().length >= 2,
    queryFn: async () => {
      const term = debouncedSearch.trim();
      // Split into tokens for broader matching
      const tokens = term.split(/[\s\-_]+/).filter(t => t.length >= 2);
      
      // Build OR filters for each token across all searchable columns
      const filters: string[] = [];
      const addTermFilters = (t: string) => {
        filters.push(`name.ilike.%${t}%`);
        filters.push(`code.ilike.%${t}%`);
        filters.push(`city.ilike.%${t}%`);
        filters.push(`descricao_complementar.ilike.%${t}%`);
      };

      // Always search the full term
      addTermFilters(term);
      // Also search individual tokens if there are multiple
      if (tokens.length > 1) {
        tokens.forEach(addTermFilters);
      }

      const { data, error } = await supabase
        .from("unit_info")
        .select("id, name, code, city, descricao_complementar")
        .or(filters.join(","))
        .order("name")
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Open dropdown when debounced results arrive
  useEffect(() => {
    if (debouncedSearch.trim().length >= 2 && units.length > 0) {
      setOpen(true);
    }
  }, [units, debouncedSearch]);

  const selectedLabel = displayValue || (value ? "Unidade vinculada" : "");

  if (value && selectedLabel) {
    return (
      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-background text-sm">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
            if (e.target.value.trim().length >= 2) setOpen(true);
          }}
          onFocus={() => {
            if (debouncedSearch.trim().length >= 2 && units.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          className="pl-9 text-sm"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground animate-spin" />
        )}
      </div>
      {open && units.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {units.map((u) => (
            <button
              key={u.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                onChange(u.id, u.name);
                setSearch("");
                setOpen(false);
              }}
            >
              <span className="font-medium">{u.name}</span>
              {u.city && <span className="text-xs text-muted-foreground ml-2">{u.city}</span>}
              {u.descricao_complementar && <span className="text-xs text-muted-foreground/70 ml-1 italic">· {u.descricao_complementar}</span>}
            </button>
          ))}
        </div>
      )}
      {open && search.trim().length >= 2 && !isFetching && units.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md p-3 text-sm text-muted-foreground text-center">
          Nenhuma unidade encontrada
        </div>
      )}
    </div>
  );
}
