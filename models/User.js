import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, required: true, unique: true },
    password: String, // hashed
    provider: {
      type: String,
      enum: ["local", "github", "google"],
      default: "local",
    },
    github: {
      accessToken: String,
      username: String,
      avatarUrl: String,
      profileUrl: String,
      bio: String,
      location: String,
      repos: [
        {
          id: Number,
          name: String,
          fullName: String,
          description: String,
          htmlUrl: String,
          language: String,
          stargazersCount: Number,
          forksCount: Number,
          openIssuesCount: Number,
          isPrivate: Boolean,
          owner: {
            login: String,
            id: Number,
            avatarUrl: String,
            htmlUrl: String,
          },
          integrationSettings: Object,
          notificationSettings: Object,
          status: String,
          lastSynced: Date,
        },
      ],
    },
    google: {
      accessToken: String,
      username: String,
      avatarUrl: String,
      profileUrl: String,
      bio: String,
      location: String,
    },
    profile: {
      avatarUrl: String,
      bio: String,
      location: String,
      website: String,
      company: String,
      social: {
        github: String,
        twitter: String,
        linkedin: String,
        website: String,
      },
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
