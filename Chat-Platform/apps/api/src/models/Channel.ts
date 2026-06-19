import mongoose from "mongoose";

const channelSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Workspace",
        required: true
    },

    isPrivate: {
        type: Boolean,
        default: false
    }

});

const Channel = mongoose.model(
    "Channel",
    channelSchema
);

export default Channel;