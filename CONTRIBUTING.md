# Contributing to OSRS Trading Tools

Thank you for your interest in contributing! We welcome all contributions, from bug reports to feature requests and code changes.

## Development Setup

1.  **Fork and Clone**: Fork the repository and clone it locally.
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Setup**:
    - Copy `.env.example` to `.env` in `packages/backend` and `packages/discord-bot` if you plan to work on those.
    - Configure the environment variables as needed (see `README.md` for details).

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
