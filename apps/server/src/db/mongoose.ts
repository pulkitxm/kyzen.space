import mongoose from "mongoose";

let connectPromise: Promise<typeof mongoose> | null = null;

function requireMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri?.trim()) {
    throw new Error("Missing MONGODB_URI. Configure it in .env.local.");
  }
  return uri.trim();
}

export async function connectMongoose(): Promise<typeof mongoose> {
  connectPromise ??= mongoose.connect(requireMongoUri());
  return connectPromise;
}

export async function disconnectMongoose(): Promise<void> {
  await mongoose.disconnect();
  connectPromise = null;
}
