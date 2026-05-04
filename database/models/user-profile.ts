import mongoose, { Schema, type InferSchemaType } from "mongoose";

const gameStatSchema = new Schema(
  {
    played: { type: Number, default: 0 },
    won: { type: Number, default: 0 },
    lost: { type: Number, default: 0 },
    drawn: { type: Number, default: 0 },
  },
  { _id: false },
);

const userProfileSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true, trim: true },
    stats: {
      type: Map,
      of: gameStatSchema,
      default: () => new Map(),
    },
  },
  { timestamps: true },
);

export type UserProfileDoc = InferSchemaType<typeof userProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const UserProfile =
  mongoose.models.UserProfile ??
  mongoose.model("UserProfile", userProfileSchema);
