import mongoose from "mongoose";

const repositorySchema = new mongoose.Schema(
  {
    // GitHub repository information
    githubId: {
      type: Number,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    description: String,
    htmlUrl: {
      type: String,
      required: true,
    },
    cloneUrl: String,
    sshUrl: String,

    // Repository metadata
    language: String,
    size: Number,
    stargazersCount: Number,
    forksCount: Number,
    openIssuesCount: Number,
    isPrivate: {
      type: Boolean,
      default: false,
    },

    // Owner information
    owner: {
      login: String,
      id: Number,
      avatarUrl: String,
      htmlUrl: String,
    },

    // Integration settings
    integrationSettings: {
      autoCreateIssues: {
        type: Boolean,
        default: false,
      },
      issueLabels: {
        type: [String],
        default: ["ai-mentor", "analysis"],
      },
      priorityLevels: {
        type: [String],
        default: ["high", "medium", "low"],
      },
      enableNotifications: {
        type: Boolean,
        default: true,
      },
    },

    // Access token (encrypted)
    accessToken: {
      type: String,
      required: true,
    },

    // Analysis history
    analysisHistory: [
      {
        analysisId: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        overallScore: Number,
        issuesFound: Number,
        issuesCreated: Number,
      },
    ],

    // Status and metadata
    status: {
      type: String,
      enum: ["active", "inactive", "error"],
      default: "active",
    },
    lastSynced: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
repositorySchema.index({ githubId: 1 });
repositorySchema.index({ fullName: 1 });
repositorySchema.index({ "owner.login": 1 });
repositorySchema.index({ status: 1 });

// Virtual for repository URL
repositorySchema.virtual("repoUrl").get(function () {
  return this.htmlUrl;
});

// Method to update last synced time
repositorySchema.methods.updateLastSynced = function () {
  this.lastSynced = new Date();
  return this.save();
};

// Method to add analysis record
repositorySchema.methods.addAnalysisRecord = function (analysisData) {
  this.analysisHistory.push(analysisData);
  return this.save();
};

// Static method to find by GitHub ID
repositorySchema.statics.findByGithubId = function (githubId) {
  return this.findOne({ githubId });
};

// Static method to find by owner
repositorySchema.statics.findByOwner = function (ownerLogin) {
  return this.find({ "owner.login": ownerLogin });
};

const Repository = mongoose.model("Repository", repositorySchema);

export default Repository;
