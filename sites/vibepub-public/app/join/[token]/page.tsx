import { Room } from "@/components/room";
export default async function Join({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <Room token={(await params).token} />;
}
