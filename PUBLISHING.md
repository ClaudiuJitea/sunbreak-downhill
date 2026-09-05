# Publish SUNBREAK to GitHub

Recommended repository details:

- **Owner:** `Imirushik`
- **Repository:** `sunbreak-downhill-3D-game`
- **Visibility:** Public
- **Description:** `A procedural cel-shaded downhill BMX racer built with Three.js—four riders, bike physics, tricks, dynamic weather and wild speed effects.`
- **Topics:** `threejs`, `typescript`, `vite`, `webgl`, `bmx`, `racing-game`, `procedural-generation`, `cel-shading`, `npr`, `browser-game`
- **Website:** leave empty until the game is deployed

## Create and push

1. While signed into the personal **Imirushik** GitHub account, open
   <https://github.com/new>.
2. Enter the details above. Do not add a README, `.gitignore`, or license on
   GitHub because this local repository already contains the project files.
3. Create the repository.
4. Open <https://github.com/settings/emails> in that same account and copy the
   private GitHub no-reply address shown there. In this project directory, set
   it **for this repository only**:

   ```sh
   git config --local user.name "Imirushik"
   git config --local user.email "YOUR_GITHUB_NOREPLY_ADDRESS"
   git commit -m "Launch SUNBREAK: Downhill Club"
   git remote add origin https://github.com/Imirushik/sunbreak-downhill-3D-game.git
   git push -u origin main
   ```

5. Confirm the repository page shows the poster and description. Then add the
   topics listed above from the repository page's **About** settings. For the
   link preview, open **Settings → General → Social preview → Edit**, then upload
   `media/SUNBREAK-showcase-poster.jpg`.

Before committing, these checks should show no videos and no unexpectedly large
files:

```sh
git status --short
git ls-files | grep -E '\\.(mp4|webm|mov|m4v)$' || true
git ls-files -z | xargs -0 du -h | sort -h | tail
```

All demo videos, generated captures, dependencies and build output remain on
this laptop and are excluded by `.gitignore`. The 1920×1080 in-engine poster is
the only generated showcase media included in the repository.

Using `git config --local` keeps the office identity unchanged. If authentication
selects an office GitHub account, cancel the push and sign into `Imirushik` in
GitHub Desktop or your preferred credential manager. Do not replace the laptop's
global Git configuration.
