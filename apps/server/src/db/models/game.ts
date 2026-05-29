import mongoose, { Schema, type InferSchemaType } from "mongoose";

const playerSchema = new Schema(
  {
    userId: { type: String, required: true },
    username: { type: String, required: true },
    role: { type: String, required: true },
  },
  { _id: false },
);

const gameSchema = new Schema(
  {
    gameType: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ["waiting", "active", "completed", "abandoned"],
      index: true,
    },
    players: { type: [playerSchema], default: [] },
    winner: { type: String, default: null },
    gameState: { type: Schema.Types.Mixed, default: {} },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type GameDoc = InferSchemaType<typeof gameSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Game =
  mongoose.models.Game ?? mongoose.model("Game", gameSchema);
