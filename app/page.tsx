import { getEnv } from "@/lib/config/env";
import { ImagePublisher } from "@/components/image-publisher";

export default async function HomePage() {
  const env = getEnv();

  return <ImagePublisher defaultMakePublic={env.S3_VISIBILITY === "public-read-acl"} />;
}
