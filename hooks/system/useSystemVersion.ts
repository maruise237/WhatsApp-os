"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export interface SystemVersion {
  current_version: string;
}

/** Version de l'image en service (fixe jusqu'au prochain déploiement). */
export function useSystemVersion() {
  return useQuery({
    queryKey: ["system-version"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: SystemVersion }>("/api/v1/system/version");
      return res.data;
    },
    staleTime: Infinity,
  });
}
