import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
{
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    channelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Channel",
        required: true
    },

    content: {
        type: String,
        required: true
    },

    edited: {
        type: Boolean,
        default: false
    }
},
{
    timestamps: true
}
);

const Message = mongoose.model(
    "Message",
    messageSchema
);

export default Message;