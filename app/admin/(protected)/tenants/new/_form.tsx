"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTenant } from "@/hooks/useCreateTenant";
import { ApiError } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Schema (mirrors server Zod; client keeps it in sync)
// ---------------------------------------------------------------------------

const formSchema = z.object({
  display_name: z.string().min(2, "2 caractères minimum").max(120, "120 caractères maximum"),
  slug: z
    .string()
    .min(2, "2 caractères minimum")
    .max(40, "40 caractères maximum")
    .regex(/^[a-z0-9-]+$/, "Uniquement des lettres minuscules, des chiffres et des tirets"),
  legal_name: z.string().min(2).max(255).optional().or(z.literal("")),
  cnpj: z.string().optional().or(z.literal("")),
  plan: z.enum(["standard", "pro", "enterprise"]),
  owner_email: z.string().email("E-mail invalide"),
});

type FormValues = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// ---------------------------------------------------------------------------

function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

// ---------------------------------------------------------------------------
// Form component
// ---------------------------------------------------------------------------

export function NewTenantForm() {
  const router = useRouter();
  const createTenant = useCreateTenant();
  const [slugLocked, setSlugLocked] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      display_name: "",
      slug: "",
      legal_name: "",
      cnpj: "",
      plan: "standard",
      owner_email: "",
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  // Auto-generate slug from display_name until user edits slug manually
  const handleDisplayNameChange = (value: string) => {
    setValue("display_name", value);
    if (!slugLocked) {
      setValue("slug", slugify(value), { shouldValidate: true });
    }
  };

  const handleSlugChange = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setValue("slug", clean, { shouldValidate: true });
    setSlugLocked(clean.length > 0);
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await createTenant.mutateAsync({
        display_name: values.display_name,
        slug: values.slug,
        legal_name: values.legal_name || undefined,
        cnpj: values.cnpj || undefined,
        plan: values.plan,
        owner_email: values.owner_email,
      });

      toast.success("Organisation créée avec succès !");
      router.push(`/admin/tenants/${result.data.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "conflict") {
          form.setError("slug", { message: "Ce slug est déjà utilisé" });
          return;
        }
        toast.error(`Erreur lors de la création de l’organisation : ${err.message}`);
      } else {
        toast.error("Erreur inattendue lors de la création de l’organisation");
      }
    }
  });

  const planValue = watch("plan");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nouvelle organisation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crée une nouvelle organisation avec le statut <em>onboarding</em>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Données de l’organisation</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {/* display_name */}
            <div className="space-y-1.5">
              <Label htmlFor="display_name">
                Nom d’affichage <span className="text-error-fg">*</span>
              </Label>
              <Input
                id="display_name"
                placeholder="Boutique de Marie"
                {...register("display_name")}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                aria-invalid={!!errors.display_name}
              />
              {errors.display_name && (
                <p className="text-xs text-error-fg">{errors.display_name.message}</p>
              )}
            </div>

            {/* slug */}
            <div className="space-y-1.5">
              <Label htmlFor="slug">
                Slug <span className="text-error-fg">*</span>
              </Label>
              <Input
                id="slug"
                placeholder="boutique-de-marie"
                {...register("slug")}
                onChange={(e) => handleSlugChange(e.target.value)}
                aria-invalid={!!errors.slug}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Uniquement des lettres minuscules, des chiffres et des tirets. Généré automatiquement.
              </p>
              {errors.slug && (
                <p className="text-xs text-error-fg">{errors.slug.message}</p>
              )}
            </div>

            {/* legal_name */}
            <div className="space-y-1.5">
              <Label htmlFor="legal_name">Raison sociale</Label>
              <Input
                id="legal_name"
                placeholder="Marie Dupont SARL"
                {...register("legal_name")}
                aria-invalid={!!errors.legal_name}
              />
              {errors.legal_name && (
                <p className="text-xs text-error-fg">{errors.legal_name.message}</p>
              )}
            </div>

            {/* identifiant fiscal (colonne `cnpj`) */}
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">Identifiant fiscal (NIU) — facultatif</Label>
              <Input
                id="cnpj"
                placeholder="Ex. : M012345678901X"
                {...register("cnpj")}
                maxLength={20}
                aria-invalid={!!errors.cnpj}
                className="font-mono"
              />
              {errors.cnpj && (
                <p className="text-xs text-error-fg">{errors.cnpj.message}</p>
              )}
            </div>

            {/* plan */}
            <div className="space-y-1.5">
              <Label htmlFor="plan">Offre</Label>
              <Select
                value={planValue}
                onValueChange={(v) =>
                  setValue("plan", v as "standard" | "pro" | "enterprise")
                }
              >
                <SelectTrigger id="plan" aria-label="Offre">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
              {errors.plan && (
                <p className="text-xs text-error-fg">{errors.plan.message}</p>
              )}
            </div>

            {/* owner_email */}
            <div className="space-y-1.5">
              <Label htmlFor="owner_email">
                E-mail du responsable <span className="text-error-fg">*</span>
              </Label>
              <Input
                id="owner_email"
                type="email"
                placeholder="responsable@entreprise.com"
                {...register("owner_email")}
                aria-invalid={!!errors.owner_email}
              />
              {errors.owner_email && (
                <p className="text-xs text-error-fg">{errors.owner_email.message}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Création…" : "Créer l’organisation"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
