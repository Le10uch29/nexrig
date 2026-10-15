import { redirect } from "next/navigation";

// The AI expert is switched off for now (components/ai/ExpertView.tsx is kept); old links lead to the builder.
export default function ExpertPage() {
  redirect("/builder");
}
