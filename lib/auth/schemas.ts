import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("E-mail invalide"),
  password: z.string().min(8, "Le mot de passe doit comporter au moins 8 caractères"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    org_name: z
      .string()
      .min(2, "Le nom de l’entreprise doit comporter au moins 2 caractères")
      .max(120, "Le nom de l’entreprise doit comporter au maximum 120 caractères"),
    email: z.string().email("E-mail invalide"),
    password: z.string().min(8, "Le mot de passe doit comporter au moins 8 caractères"),
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ["password_confirm"],
    message: "Les mots de passe ne correspondent pas",
  });

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Signup de quem foi CONVIDADO: a empresa já existe, então pedir o nome dela
 * seria pedir para a pessoa batizar a organização de outra gente.
 *
 * É um schema à parte, e não `org_name` opcional no de cima, de propósito: o
 * caminho normal continua exigindo o nome, com a mesma mensagem, e nada no
 * fluxo de quem abre a própria empresa afrouxa por causa deste.
 */
export const signupComConviteSchema = z
  .object({
    email: z.string().email("E-mail invalide"),
    password: z.string().min(8, "Le mot de passe doit comporter au moins 8 caractères"),
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ["password_confirm"],
    message: "Les mots de passe ne correspondent pas",
  });

export type SignupComConviteInput = z.infer<typeof signupComConviteSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("E-mail invalide"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Le mot de passe doit comporter au moins 8 caractères"),
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ["password_confirm"],
    message: "Les mots de passe ne correspondent pas",
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
