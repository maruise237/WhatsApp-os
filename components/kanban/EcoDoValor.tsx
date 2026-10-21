"use client";

import { useWatch, type Control, type FieldValues, type Path } from "react-hook-form";

import { formatMontant, parseMontantEnCents } from "@/lib/money";

/**
 * Mostra, embaixo do campo, como o valor digitado foi entendido.
 *
 * Dinheiro nunca deve ser interpretado em silêncio: era assim que "249.90"
 * virava 24 990,00 e só aparecia no relatório, dias depois. Com o eco, quem
 * digita vê o número que vai ser gravado antes de salvar.
 *
 * Usa `useWatch` (e não `form.watch()` dentro do render) porque o segundo
 * devolve uma função que o React Compiler não consegue memoizar, e ele então
 * desiste de otimizar o formulário inteiro.
 */
export function EcoDoValor<T extends FieldValues>({
  control,
  devise,
}: {
  control: Control<T>;
  /** Devise du montant (XAF par défaut) — décide des décimales et du symbole. */
  devise?: string | null;
}) {
  const digitado = useWatch({ control, name: "valueReais" as Path<T> }) as unknown as
    | string
    | undefined;
  const centavos = parseMontantEnCents(digitado ?? "", devise);
  if (centavos === null) return null;
  return <p className="text-xs text-muted-foreground">= {formatMontant(centavos, devise)}</p>;
}
