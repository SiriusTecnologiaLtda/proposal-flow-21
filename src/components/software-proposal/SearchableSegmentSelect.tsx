import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search, Tag } from "lucide-react";

interface Props {
  value: string | null;
  displayValue?: string;
  onChange: (segmentId: string | null, segmentName: string) => void;
  placeholder?: string;
}

export function SearchableSegmentSelect({
  value,
  displayValue,
  onChange,
  placeholder = "Buscar segmento...",
}: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: segments = [] } = useQuery({
    queryKey: ["segments-lookup", search],
    enabled: search.length >= 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("software_segments")
        .select("id, name")
        .eq("is_active", true)
        .ilike("name", `%${search}%`)
        .order("name")
        .limit(20);
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

  const selectedLabel = displayValue || (value ? "Segmento vinculado" : "");

  if (value && selectedLabel) {
    return (
      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-background text-sm">
        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
          onFocus={() => search.length >= 1 && setOpen(true)}
          placeholder={placeholder}
          className="pl-9 text-sm"
        />
      </div>
      {open && segments.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {segments.map((s) => (
            <button
              key={s.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                onChange(s.id, s.name);
                setSearch("");
                setOpen(false);
              }}
            >
              <span className="font-medium">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
