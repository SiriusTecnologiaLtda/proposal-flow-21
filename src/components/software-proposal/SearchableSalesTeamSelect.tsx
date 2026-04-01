import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search, User } from "lucide-react";

interface Props {
  value: string | null;
  displayValue?: string;
  onChange: (memberId: string | null, memberName: string) => void;
  placeholder?: string;
  roleFilter?: string[];
  label?: string;
}

export function SearchableSalesTeamSelect({
  value,
  displayValue,
  onChange,
  placeholder = "Buscar membro...",
  roleFilter,
  label,
}: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: members = [] } = useQuery({
    queryKey: ["sales-team-lookup", search, roleFilter?.join(",")],
    enabled: search.length >= 2,
    queryFn: async () => {
      let query = supabase
        .from("sales_team")
        .select("id, name, code, role, email")
        .or(`name.ilike.%${search}%,code.ilike.%${search}%,email.ilike.%${search}%`)
        .order("name")
        .limit(20);

      if (roleFilter && roleFilter.length > 0) {
        query = query.in("role", roleFilter as any);
      }

      const { data, error } = await query;
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

  const selectedLabel = displayValue || (value ? label || "Membro vinculado" : "");

  if (value && selectedLabel) {
    return (
      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-background text-sm">
        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
      {open && members.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                onChange(m.id, m.name);
                setSearch("");
                setOpen(false);
              }}
            >
              <span className="font-medium">{m.name}</span>
              <span className="text-xs text-muted-foreground ml-2">{m.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
