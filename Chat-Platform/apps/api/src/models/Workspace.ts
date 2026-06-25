import mongoose from "mongoose";

const workspaceSchema = new mongoose.Schema(
{
    name: {
        type: String,
        required: true
    },

    description: {
        type: String,
        default: ""
    },

    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    members: [
        {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },

            role: {
                type: String,
                default: "member"
            }
        }
    ]
},
{
    timestamps: true
}
);

const Workspace = mongoose.model(
    "Workspace",
    workspaceSchema
);

export default Workspace;