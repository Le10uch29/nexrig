import { redirect } from "next/navigation";

// FPS Lab lives at /games; this alias keeps the name people use working.
export default function FpsLabAlias() {
  redirect("/games");
}
