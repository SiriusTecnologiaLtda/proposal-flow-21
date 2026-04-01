import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search, Package } from "lucide-react";

interface Props {
  value: string | null;
  displayValue?: string;
  onChange: (catalogItemId: string | null, catalogItemName: string) => void;
  placeholder?: string;
}

export function SearchableCatalogSelect({ value, displayValue, onChange, placeholder = "Buscar no catálogo..." }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: catalogItems = [] } = useQuery({
    queryKey: ["catalog-lookup", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      // Search catalog items by name, and also check aliases
      const { data: items, error } = await supabase
        .from("software_catalog_items")
        .select("id, name, vendor_name, category, part_number, external_code")
        .eq("is_active", true)
        .or(`name.ilike.%${search}%,vendor_name.ilike.%${search}%,part_number.ilike.%${search}%,external_code.ilike.%${search}%`)
        .order("name")
        .limit(30);
      if (error) throw error;
      return items;
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

  const selectedLabel = displayValue || (value ? "Item vinculado" : "");

  if (value && selectedLabel) {
    return (
      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-background text-sm">
        <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
      {open && catalogItems.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {catalogItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                onChange(item.id, item.name);
                setSearch("");
                setOpen(false);
              }}
            >
              <span className="font-medium">{item.name}</span>
              {item.vendor_name && (
                <span className="text-xs text-muted-foreground ml-2">{item.vendor_name}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
