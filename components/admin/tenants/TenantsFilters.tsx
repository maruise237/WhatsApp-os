"use client";
import { useCallback, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminTenantsFilters } from "@/hooks/useAdminTenants";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TenantsFiltersProps {
  filters: AdminTenantsFilters;
  onChange: (filters: AdminTenantsFilters) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TenantsFilters({ filters, onChange }: TenantsFiltersProps) {
  const [inputValue, setInputValue] = useState(filters.q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (value: string) => {
      setInputValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange({ ...filters, q: value || undefined });
      }, 300);
    },
    [filters, onChange],
  );

  const handleStatus = useCallback(
    (value: string) => {
      onChange({
        ...filters,
        status: value === "all" ? undefined : (value as AdminTenantsFilters["status"]),
      });
    },
    [filters, onChange],
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        placeholder="Rechercher par nom, slug ou numéro d’entreprise..."
        value={inputValue}
        onChange={(e) => handleSearch(e.target.value)}
        className="sm:w-80"
        aria-label="Rechercher des organisations"
      />
      <Select
        value={filters.status ?? "all"}
        onValueChange={handleStatus}
      >
        <SelectTrigger className="sm:w-44" aria-label="Filtrer par statut">
          <SelectValue placeholder="Statut" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les statuts</SelectItem>
          <SelectItem value="active">Actif</SelectItem>
          <SelectItem value="onboarding">Configuration initiale</SelectItem>
          <SelectItem value="suspended">Suspendue</SelectItem>
          <SelectItem value="redacted">Caviardée</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
