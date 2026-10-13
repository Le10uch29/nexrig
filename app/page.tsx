import { redirect } from "next/navigation";

/** The builder is the product; there is no separate marketing landing page. */
export default function Home() {
  redirect("/builder");
}
