import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sales OS",
    short_name: "Sales OS",
    description: "Central vendeur privé pour catalogue, commandes et paiements vérifiés.",
    start_url: "/app/inbox",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f766e",
    lang: "fr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}
