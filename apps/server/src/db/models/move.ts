import mongoose, { Schema, type InferSchemaType } from "mongoose";

const moveSchema = new Schema(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: "Game",
      required: true,
      index: true,
    },
    moveNumber: { type: Number, required: true },
    playerId: { type: String, required: true },
    moveData: { type: Schema.Types.Mixed, required: true },
    timestamp: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);

moveSchema.index({ gameId: 1, moveNumber: 1 }, { unique: true });

export type MoveDoc = InferSchemaType<typeof moveSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Move =
  mongoose.models.Move ?? mongoose.model("Move", moveSchema);
