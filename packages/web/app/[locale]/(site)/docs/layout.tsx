import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Configuration reference for OmC. Agents, categories, skills, hooks, MCPs, and more.",
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children
}
