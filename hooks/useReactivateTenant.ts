"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";

export interface ReactivateTenantPayload {
  id: string;
  reason: string;
}

export function useReactivateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: ReactivateTenantPayload) =>
      apiClient.post(`/api/v1/admin/tenants/${id}/reactivate`, { reason }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "tenant", variables.id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      toast.success("Organisation réactivée avec succès");
    },
    onError: (err: Error) => {
      toast.error("Erreur lors de la réactivation de l’organisation", { description: err.message });
    },
  });
}
