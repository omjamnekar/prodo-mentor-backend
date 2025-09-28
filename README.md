# Legal Assistant Backend

Backend API server for the Legal Assistant AI Mentor system with GitHub integration and MongoDB storage.

## Features

- **GitHub OAuth Integration** - Connect and manage GitHub repositories
- **MongoDB Storage** - Store repository configurations and analysis data
- **RESTful API** - Clean API endpoints for frontend integration
- **Repository Management** - Track connected repositories and settings

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Setup

Create a `.env` file in the backend directory:

```env
# MongoDB Connection (required)
MONGODB_URI=mongodb://localhost:27017/legal-assistant

# GitHub OAuth (optional for demo)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Server Configuration
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# JWT Secret
JWT_SECRET=your_secret_key_here
```

### 3. Start MongoDB

Make sure MongoDB is running locally or use MongoDB Atlas:

```bash
# Local MongoDB
mongod

# Or use MongoDB Atlas and update MONGODB_URI in .env
```

### 4. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3001`

## API Endpoints

### Health Check

- `GET /health` - Server health status

### GitHub Integration

- `POST /api/github/connect` - GitHub OAuth callback handler
- `POST /api/github/save-integration` - Save repository integration
- `POST /api/github/create-issue` - Create GitHub issue
- `GET /api/github/repositories/:username` - Get user repositories

### Repository Management

- `GET /api/repositories` - Get all connected repositories
- `GET /api/repositories/:id` - Get repository by ID
- `GET /api/repositories/github/:githubId` - Get repository by GitHub ID
- `PUT /api/repositories/:id/settings` - Update repository settings
- `POST /api/repositories/:id/analysis` - Add analysis record
- `GET /api/repositories/:id/analysis-history` - Get analysis history
- `DELETE /api/repositories/:id` - Disconnect repository
- `POST /api/repositories/:id/sync` - Sync repository with GitHub

## Database Schema

### Repository Model

```javascript
{
  githubId: Number,           // GitHub repository ID
  name: String,               // Repository name
  fullName: String,           // Owner/repository
  description: String,        // Repository description
  htmlUrl: String,           // GitHub URL
  owner: {                   // Owner information
    login: String,
    id: Number,
    avatarUrl: String
  },
  integrationSettings: {     // Integration configuration
    autoCreateIssues: Boolean,
    issueLabels: [String],
    priorityLevels: [String]
  },
  analysisHistory: [{        // Analysis records
    analysisId: String,
    timestamp: Date,
    overallScore: Number,
    issuesFound: Number
  }],
  status: String,            // active | inactive | error
  lastSynced: Date
}
```

## Development

### Project Structure

```
backend/
├── models/           # MongoDB models
│   └── Repository.js
├── routes/          # API routes
│   ├── github.js
│   └── repositories.js
├── server.js        # Main server file
├── package.json     # Dependencies
└── .env.example     # Environment template
```

### Testing

```bash
# Test server health
curl http://localhost:3001/health

# Get repositories
curl http://localhost:3001/api/repositories
```

## Frontend Integration

The frontend automatically connects to the backend at `http://localhost:3001`.

Key integration points:

- Repository fetching on AI Mentor Analysis page
- GitHub OAuth flow through backend
- Repository management and settings
- Analysis data storage and retrieval

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Ensure MongoDB is running
   - Check MONGODB_URI in .env
   - For Atlas, whitelist your IP

2. **GitHub OAuth Issues**
   - Verify GitHub app credentials
   - Check redirect URL configuration
   - Ensure proper OAuth scopes

3. **CORS Errors**
   - Check CORS_ORIGIN in .env
   - Ensure frontend URL matches

4. **Port Conflicts**
   - Change PORT in .env if 3001 is in use
   - Update frontend API calls accordingly

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production`
2. Use production MongoDB instance
3. Configure proper CORS origins
4. Set up SSL/TLS certificates
5. Use process manager (PM2, etc.)
6. Set up monitoring and logging

## Security Notes

- Access tokens are stored encrypted in MongoDB
- Use HTTPS in production
- Implement rate limiting for production use
- Validate all API inputs
- Use proper authentication/authorization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request
