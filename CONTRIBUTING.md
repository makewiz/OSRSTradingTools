# Contributing to OSRS Trading Tools

Thank you for your interest in contributing! We welcome all contributions, from bug reports to feature requests and code changes.

## Development Setup

1.  **Fork and Clone**: Fork the repository and clone it locally.
2.  **Start Database**:
    ```bash
    docker compose up -d
    ```
3.  **Install Dependencies**:
    ```bash
    npm install
    ```
4.  **Environment Setup (Optional)**:
    - The core web app works out of the box with the default local database.
    - If you wish to configure Gemini AI, Discord OAuth, or the Discord bot, copy `.env.example` to `.env` in `packages/backend` and `packages/discord-bot`.
    - See `README.md` for a comprehensive tier-by-tier environment variables guide.

## Running Locally

-   **Backend**: `npm run dev:backend`
-   **Frontend**: `npm run dev:frontend`
-   **Discord Bot**: `npm run dev:bot`

## Submitting Changes

1.  Create a new branch for your feature or fix: `git checkout -b feature/amazing-feature`.
2.  Commit your changes with clear messages.
3.  Push to your fork and submit a Pull Request.

## Code Style

-   We use `eslint` and `prettier` for linting and formatting.
-   Please ensure your code is consistent with the existing codebase.

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
