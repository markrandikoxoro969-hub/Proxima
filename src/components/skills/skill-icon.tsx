import {
  Calculator,
  ChartBar,
  Code,
  FileText,
  Globe,
  ImageSquare,
  Lightbulb,
  ListChecks,
  PencilLine,
  Wrench,
} from "@phosphor-icons/react";
import type { SkillCatalogItem } from "@/lib/skills/catalog";

export function SkillIcon({ icon, className }: { icon: SkillCatalogItem["icon"]; className?: string }) {
  const props = { className, weight: "duotone" as const, "aria-hidden": true as const };
  switch (icon) {
    case "code":
      return <Code {...props} />;
    case "globe":
      return <Globe {...props} />;
    case "writing":
      return <PencilLine {...props} />;
    case "math":
      return <Calculator {...props} />;
    case "chart":
      return <ChartBar {...props} />;
    case "document":
      return <FileText {...props} />;
    case "productivity":
      return <ListChecks {...props} />;
    case "creative":
      return <Lightbulb {...props} />;
    case "image":
      return <ImageSquare {...props} />;
    case "wrench":
      return <Wrench {...props} />;
  }
}
