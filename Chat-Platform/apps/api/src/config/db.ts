import mongoose from "mongoose";

async function connectDB() {
    try {
        await mongoose.connect(
            "mongodb://127.0.0.1:27017/rtc-platform"
        );

        console.log("MongoDB Connected");
    }
    catch(err) {
        console.log(err);
    }
}

export default connectDB;