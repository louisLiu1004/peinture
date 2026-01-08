

# Peinture (Free AI Image Gen)

![Stars](https://img.shields.io/github/stars/Amery2010/peinture?style=flat-square)
![Forks](https://img.shields.io/github/forks/Amery2010/peinture?style=flat-square)
![Issues](https://img.shields.io/github/issues/Amery2010/peinture?style=flat-square)

A sleek, dark-themed AI image generator built with React, TypeScript, and Tailwind CSS. This application leverages powerful generative models from **Hugging Face**, **Gitee AI**, and **Model Scope** to create high-quality images from text prompts in seconds.

![App Screenshot](https://cdn.u14.app/upload/WX20251209-170748@2x.png)

![Image Editor](https://cdn.u14.app/upload/WX20251219-170320@2x.jpg)

![Cloud Gallery](https://cdn.u14.app/upload/WX20251220-165529@2x.jpg)

## ✨ Features

- **Triple AI Providers**: Seamlessly switch between **Hugging Face**, **Gitee AI**, and **Model Scope** providers to access different model ecosystems and quotas.
- **Multi-Model Support**: Access diverse models including:
  - Hugging Face: `Z-Image Turbo`, `Qwen Image Fast`, `Ovis Image`, `FLUX.1 Schnell`
  - Gitee AI: `Z-Image Turbo`, `Qwen Image`, `FLUX.1 Schnell`, `FLUX.1 Krea`, `FLUX.1 Dev`
  - Model Scope: `Z-Image Turbo`, `FLUX.2`, `FLUX.1 Krea`, `FLUX.1`
- **Image Editor**: Modify existing images with precision. Use Brush and Rectangle tools to guide AI edits, and upload up to 3 reference images for style or content guidance (Powered by Qwen-Image-Edit).
- **Live Motion**: Transform static images into dynamic short videos using advanced Image-to-Video models (Wan2.2). Experience cinematic motion and bring your art to life (Supported on Hugging Face & Gitee AI).
- **Cloud Storage & Gallery**: Configure **S3-compatible storage** (AWS, R2, MinIO) or **WebDAV** to save your creations privately in the cloud. Browse, manage, and download your cloud assets directly from the built-in Gallery.
- **Prompt Optimization**: Integrated AI prompt enhancer that expands simple ideas into detailed, cinematic descriptions (powered by Pollinations.ai for Hugging Face, DeepSeek for Gitee AI and Model Scope).
- **Auto Translation**: Intelligent detection and translation of non-English prompts to optimize performance for English-centric models like **FLUX**.
- **Advanced Controls**: Fine-tune your creations with adjustable **inference steps**, **seed control**, **guidance scale** (for Flux), and **HD Mode** (High Definition).
- **History Gallery**: Automatically saves generated images locally. View, zoom, pan, and manage your creation history.
- **4x Resolution**: AI upscaling technology to increase image resolution up to 4x (Only supported on Hugging Face).
- **Multilingual**: Full support for English and Chinese (中文) interfaces.
- **Token Management**: Configure personal API tokens for higher rate limits and stability.
- **Privacy Focused**: History is stored in your browser's LocalStorage; Cloud credentials are also stored locally and never sent to our servers (except to authenticate with your storage provider).

## 🛠 Tech Stack

- **Framework**: React 19
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Animation**: CSS Transitions & Tailwind
- **APIs**:
  - **Hugging Face Inference API**
  - **Gitee AI API**
  - **Model Scope API**
  - **Pollinations.ai**
  - **S3 / WebDAV Protocols**

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn or pnpm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Amery2010/peinture.git
   cd peinture
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser at `http://localhost:5173`.

## 📦 Deployment

This project is a static Single Page Application (SPA), making it easy to deploy on any platform that supports static hosting.

### Option 0: Docker (Recommended for Self-Hosting)

Docker deployment includes a backend proxy server that keeps your API keys secure. Users won't be able to see the API keys in their browser.

**Prerequisites:**
- Docker and Docker Compose installed

**Quick Start:**

1. Clone the repository:
   ```bash
   git clone https://github.com/Amery2010/peinture.git
   cd peinture
   ```

2. Create a `.env` file with your API keys:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your keys:
   ```env
   # OpenRouter API Configuration
   OPENROUTER_API_URL=https://openrouter.ai/api/v1
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   ```

3. Build and start the container:
   ```bash
   docker-compose up -d
   ```

4. Open your browser at `http://localhost:13000`

**Configuration Options:**

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `OPENROUTER_API_URL` | OpenRouter API base URL | `https://openrouter.ai/api/v1` |
| `OPENROUTER_API_KEY` | Your OpenRouter API key | (required) |

**Commands:**

```bash
# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# Update to latest version
git pull
docker-compose up -d --build
```

**How it works:**
- The frontend is built and served by Nginx
- API requests to `/api/proxy/openrouter/*` are forwarded to the backend proxy server
- The backend proxy injects your API key and forwards requests to OpenRouter
- Your API key never leaves the server and is not exposed to users

**Note:** If users configure their own API key in the Settings UI, their requests will bypass the proxy and go directly to OpenRouter.


### Option 1: Vercel (Recommended)

Vercel is optimized for frontend frameworks and requires zero configuration.

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Run the deploy command from the project root:
   ```bash
   vercel
   ```

3. Follow the prompts. Vercel will automatically detect Vite and set the build command to `npm run build` and the output directory to `dist`.

**Alternatively, via the Vercel Dashboard:**
1. Push your code to GitHub.
2. Import the repository in Vercel.
3. Keep the default "Framework Preset" as `Vite`.
4. Click **Deploy**.

### Option 2: Cloudflare Pages

Cloudflare Pages is the best way to host static assets on the Cloudflare network.

1. Push your code to a GitHub repository.
2. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and go to **Compute (Workers & Pages)** > **Create Application** > **Pages** > **Connect to Git**.
3. Select your repository.
4. In "Build settings":
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Click **Save and Deploy**.

### Option 3: Static CDN (Nginx, Apache, Netlify, S3)

To host on any standard web server or CDN:

1. Build the project locally:
   ```bash
   npm run build
   ```

2. This will generate a `dist` folder containing `index.html` and bundled assets.

3. Upload the **contents** of the `dist` folder to your server's public root directory (e.g., `/var/www/html` or an S3 bucket).

4. **Important for SPAs**: Ensure your server is configured to redirect all 404 requests to `index.html` so that React Router (if added in the future) or client-side logic handles the routing.

## ⚙️ Configuration

You can configure API tokens in the app's **Settings** menu.

### Hugging Face Token (Optional)
The application works out-of-the-box using public quotas. However, for heavy usage or during peak times, providing your own token is recommended.
1. Get a token from [Hugging Face Settings](https://huggingface.co/settings/tokens).
2. Paste it into the **Hugging Face Token** field in Settings.

### Gitee AI Token (Required for Gitee)
To use the Gitee AI provider, you must provide an API token.
1. Get a token from [Gitee AI Dashboard](https://ai.gitee.com/dashboard/settings/tokens).
2. Paste it into the **Gitee AI Token** field in Settings.
3. Gitee AI provides a daily free quota for generated images.

### Model Scope Token (Required for Model Scope)
To use the Model Scope provider, you must provide an API token.
1. Get a token from [Model Scope Dashboard](https://modelscope.cn/my/myaccesstoken).
2. Paste it into the **Model Scope Token** field in Settings.

*Tokens are stored securely in your browser's `localStorage` and are strictly used to authenticate requests to the respective Inference endpoints.*

### Cloud Storage (Optional)
To save your creations to the cloud:
1. Go to **Settings > Storage**.
2. Select **S3 Storage** or **WebDAV**.
3. Enter your credentials (e.g., Access Key/Secret Key for S3, URL/User/Pass for WebDAV).
4. Use the "Test Connection" button to verify.
5. Once configured, a "Gallery" tab will appear, and you can upload images directly from the Creation or Editor views.

## ❓ FAQ

**Q: Is this service free to use?**
A: Yes, this project is completely free. It defaults to using public API quotas. Due to potential limits on public quotas during peak times, you can configure your own Hugging Face token in the settings for a more stable generation experience and higher usage quotas. Gitee AI and Model Scope require you to provide a token to use their free quotas.

**Q: Is my data and privacy safe?**
A: Absolutely. We prioritize privacy. All generation history, settings, and tokens are stored locally in your browser (LocalStorage). We do not have a backend database, and we do not collect your personal usage data. Please note: Generated images are kept for 24 hours, so be sure to download your favorites. Prompt history is temporary and clears when you close the page.

**Q: How does the multi-token system work?**
A: You can enter multiple tokens separated by commas. The system automatically creates a pool. If the current token exhausts its daily quota, the system will automatically mark it as exhausted for the day and seamlessly switch to the next available token, ensuring your creation is uninterrupted. This mechanism applies to Hugging Face, Gitee AI, and Model Scope.

**Q: Which services power this app?**
A: Image generation for Hugging Face is powered by Hugging Face, and prompt optimization is provided by Pollinations.ai. Image generation and prompt optimization for Gitee AI are provided by Gitee AI. Image generation and prompt optimization for Model Scope are provided by Model Scope.

**Q: What is Live Motion?**
A: The Live feature transforms static images into dynamic short videos. By leveraging advanced Image-to-Video models (such as Wan2.2), the AI analyzes the scene's composition to generate natural motion and cinematic effects, bringing your creation to life. Currently, only Hugging Face and Gitee AI are supported.

**Q: How does the Image Editor work?**
A: The Image Editor allows you to modify existing images using AI. You can draw on a transparent layer (using Brush or Rectangle tools) to indicate where you want changes, then provide an AI command. The system merges your drawings with the original image and sends them to the Qwen-Image-Edit model. You can also upload up to 3 reference images to guide the AI's artistic style or content.

**Q: Can I host this myself?**
A: Yes! This is an open-source project licensed under MIT. You can fork the repository from GitHub and deploy it to Vercel, Cloudflare Pages, or any static hosting service.

## 🔄 Keep Your Fork Updated

If you have forked this project, you can use GitHub Actions to automatically sync your repository with the original repository.

1. In your forked repository, create a new file at `.github/workflows/sync.yml`.
2. Paste the following content into the file:

```yaml
name: Upstream Sync

permissions:
  contents: write

on:
  schedule:
    - cron: "0 0 * * *" # Run every day at 00:00 UTC
  workflow_dispatch: # Allow manual triggering

jobs:
  sync_latest_from_upstream:
    name: Sync latest commits from upstream repo
    runs-on: ubuntu-latest
    if: ${{ github.event.repository.fork }}

    steps:
      # Step 1: run a standard checkout action
      - name: Checkout target repo
        uses: actions/checkout@v3

      # Step 2: run the sync action
      - name: Sync upstream changes
        id: sync
        uses: aormsby/Fork-Sync-With-Upstream-action@v3.4
        with:
          upstream_sync_repo: Amery2010/peinture
          upstream_sync_branch: main
          target_sync_branch: main
          target_repo_token: ${{ secrets.GITHUB_TOKEN }} # Automatically generated, no need to set

          # Set test_mode true to run tests instead of the true action!!
          test_mode: false

      - name: Sync check
        if: failure()
        run: |
          echo "[Error] Due to a change in the workflow file of the upstream repository, GitHub has automatically suspended the scheduled automatic update. You need to manually sync your fork."
          exit 1
```

3. Commit the changes. Your fork will now check for updates daily and sync automatically.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License.
