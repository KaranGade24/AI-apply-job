import mongoose from 'mongoose';

const langGraphCheckpointSchema = new mongoose.Schema(
  {
    threadId: {
      type: String,
      required: true,
      index: true,
    },
    checkpointNamespace: {
      type: String,
      default: '',
    },
    checkpointId: {
      type: String,
      required: true,
    },
    parentCheckpointId: {
      type: String,
      default: null,
    },
    checkpoint: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    pendingWrites: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

langGraphCheckpointSchema.index(
  { threadId: 1, checkpointNamespace: 1, checkpointId: 1 },
  { unique: true }
);

export const LangGraphCheckpoint =
  mongoose.models.LangGraphCheckpoint || mongoose.model('LangGraphCheckpoint', langGraphCheckpointSchema);

export default LangGraphCheckpoint;
