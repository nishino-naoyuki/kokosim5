Add-Type -AssemblyName System.Drawing

$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public class SpriteProcessor {
    // Region IDs:
    // 0: Transparent BG
    // 1: Dark Outline / Black parts (Spikes, Belt, Hair)
    // 2: Skin / Leather Glove / White Stirrup Cutout (Keep original RGB)
    // 3: Cap / Helmet (CAP - Red in mask)
    // 4: Undershirt (UNDERSHIRT - Cyan in mask)
    // 5: Jersey Shirt (SHIRT - Green in mask)
    // 6: Jersey Pants (PANTS - Blue in mask)
    // 7: Socks (SOCKS - Magenta in mask)

    public static void ProcessPitcherFromSample(string inputPath, string outDir) {
        using (Bitmap src = new Bitmap(inputPath)) {
            int cropX = 160, cropY = 20, W = 330, H = 728;
            Bitmap crop = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(crop)) {
                g.DrawImage(src, new Rectangle(0, 0, W, H), new Rectangle(cropX, cropY, W, H), GraphicsUnit.Pixel);
            }

            // 1A. Exterior FloodFill from outer image borders (stops at dark character outline)
            bool[,] isBg = new bool[W, H];
            Queue<Point> q = new Queue<Point>();

            for (int x = 0; x < W; x++) {
                q.Enqueue(new Point(x, 0));
                isBg[x, 0] = true;
                q.Enqueue(new Point(x, H - 1));
                isBg[x, H - 1] = true;
            }
            for (int y = 0; y < H; y++) {
                q.Enqueue(new Point(0, y));
                isBg[0, y] = true;
                q.Enqueue(new Point(W - 1, y));
                isBg[W - 1, y] = true;
            }

            int[,] borderSeeds = { { 20, 690 }, { 20, 710 }, { 310, 690 }, { 310, 710 }, { 156, 715 } };
            for (int i = 0; i < borderSeeds.GetLength(0); i++) {
                int sx = borderSeeds[i, 0], sy = borderSeeds[i, 1];
                if (!isBg[sx, sy]) {
                    isBg[sx, sy] = true;
                    q.Enqueue(new Point(sx, sy));
                }
            }

            int[] dx = { -1, 1, 0, 0 };
            int[] dy = { 0, 0, -1, 1 };

            while (q.Count > 0) {
                Point p = q.Dequeue();
                for (int d = 0; d < 4; d++) {
                    int nx = p.X + dx[d];
                    int ny = p.Y + dy[d];
                    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                    if (isBg[nx, ny]) continue;

                    Color c = crop.GetPixel(nx, ny);
                    int lum = (c.R + c.G + c.B) / 3;
                    bool isDarkOutline = (c.R < 85 && c.G < 85 && c.B < 95);

                    if (ny >= 675) {
                        bool inLeftShoe = (nx >= 62 && nx <= 111 && ny <= 718);
                        bool inRightShoe = (nx >= 222 && nx <= 284 && ny <= 723);
                        if (!inLeftShoe && !inRightShoe) {
                            isBg[nx, ny] = true;
                            q.Enqueue(new Point(nx, ny));
                            continue;
                        }
                        if (lum > 90 || (c.R > c.B + 18 && c.R > 55)) {
                            isBg[nx, ny] = true;
                            q.Enqueue(new Point(nx, ny));
                            continue;
                        }
                    }

                    if (!isDarkOutline) {
                        isBg[nx, ny] = true;
                        q.Enqueue(new Point(nx, ny));
                    }
                }
            }

            // 1B. Separate FloodFill specifically for the enclosed dirt triangle between the legs (x: 85..235, y: 418..695)
            // Never enters white/grey pants because dirt has warm tan/brown hue (R - B >= 12) or chalk line inside dirt
            Queue<Point> dirtQ = new Queue<Point>();
            int[] dirtSeedY = { 445, 480, 520, 560, 600, 640, 670 };
            foreach (int sy in dirtSeedY) {
                int sx = 156;
                if (!isBg[sx, sy]) {
                    isBg[sx, sy] = true;
                    dirtQ.Enqueue(new Point(sx, sy));
                }
            }
            while (dirtQ.Count > 0) {
                Point p = dirtQ.Dequeue();
                for (int d = 0; d < 4; d++) {
                    int nx = p.X + dx[d];
                    int ny = p.Y + dy[d];
                    if (nx < 85 || nx > 235 || ny < 415 || ny >= 695) continue;
                    if (isBg[nx, ny]) continue;

                    Color c = crop.GetPixel(nx, ny);
                    bool isDarkOutline = (c.R < 85 && c.G < 85 && c.B < 95);
                    if (isDarkOutline) continue;

                    // Check if warm mound dirt (R - B >= 12) or thin chalk line (y: 495..520 or 575..592) between legs
                    bool isWarmDirt = (c.R - c.B >= 12);
                    bool isChalkBetweenLegs = (nx >= 112 && nx <= 198 && ((ny >= 492 && ny <= 522) || (ny >= 572 && ny <= 595)));
                    if (isWarmDirt || isChalkBetweenLegs) {
                        isBg[nx, ny] = true;
                        dirtQ.Enqueue(new Point(nx, ny));
                    }
                }
            }

            // Clean any remaining thin horizontal dirt/rubber lines outside the two shoes
            for (int y = 650; y < H; y++) {
                for (int x = 0; x < W; x++) {
                    if (y < 675) {
                        if (x < 60 || x > 295 || (x > 116 && x < 215)) {
                            isBg[x, y] = true;
                        }
                    } else {
                        bool inLeftShoe = (x >= 62 && x <= 111 && y <= 718);
                        bool inRightShoe = (x >= 222 && x <= 284 && y <= 723);
                        if (!inLeftShoe && !inRightShoe) {
                            isBg[x, y] = true;
                        }
                    }
                }
            }

            // 2. Erase baked-in number "1" and rectangular cloth patch on upper back (x: 96..189, y: 166..261)
            // Unify the entire patch region seamlessly with the surrounding jersey back color (244, 244, 236)
            for (int y = 166; y <= 261; y++) {
                Color leftSample = crop.GetPixel(92, y);
                Color rightSample = crop.GetPixel(193, y);
                for (int x = 96; x <= 189; x++) {
                    if (!isBg[x, y]) {
                        float t = (float)(x - 96) / (189 - 96);
                        int lr = Math.Max(238, (int)leftSample.R);
                        int lg = Math.Max(236, (int)leftSample.G);
                        int lb = Math.Max(228, (int)leftSample.B);
                        int rr = Math.Max(238, (int)rightSample.R);
                        int rg = Math.Max(236, (int)rightSample.G);
                        int rb = Math.Max(228, (int)rightSample.B);
                        int r = (int)(lr * (1 - t) + rr * t);
                        int g = (int)(lg * (1 - t) + rg * t);
                        int b = (int)(lb * (1 - t) + rb * t);
                        crop.SetPixel(x, y, Color.FromArgb(255, r, g, b));
                    }
                }
            }

            // 3. Build Base Blank Sprite & Color ID Mask Sprite
            Bitmap baseSprite = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            Bitmap maskSprite = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            byte[,] regionMap = new byte[W, H];

            for (int y = 0; y < H; y++) {
                for (int x = 0; x < W; x++) {
                    if (isBg[x, y]) {
                        baseSprite.SetPixel(x, y, Color.FromArgb(0, 0, 0, 0));
                        maskSprite.SetPixel(x, y, Color.FromArgb(0, 0, 0, 0));
                        regionMap[x, y] = 0;
                        continue;
                    }

                    Color c = crop.GetPixel(x, y);
                    int lum = (int)(0.299 * c.R + 0.587 * c.G + 0.114 * c.B);
                    int maxC = Math.Max(c.R, Math.Max(c.G, c.B));
                    int minC = Math.Min(c.R, Math.Min(c.G, c.B));

                    byte reg = 2;

                    // Cap (y < 75)
                    if (y < 75) {
                        if (lum < 20 && (c.B - c.R) < 6) reg = 1; // Outer black line of cap
                        else reg = 3; // Cap body & visor
                    }
                    // Hair & Head/Neck Skin (y: 75..114)
                    else if (y >= 75 && y <= 114) {
                        if (x >= 198 && y >= 102) {
                            reg = (lum < 28) ? (byte)1 : (byte)2; // Top of leather glove
                        } else if (c.B > c.R + 8 && y < 84) {
                            reg = 3; // Bottom rim of cap/visor
                        } else if (lum < 72 || (c.R - c.B < 12 && lum < 95)) {
                            reg = 1; // Hair / dark outline
                        } else {
                            reg = 2; // Neck / ear skin
                        }
                    }
                    // Undershirt collar (y: 115..126, x: 122..188)
                    else if (y >= 115 && y <= 126 && x >= 122 && x <= 188) {
                        if (lum < 22) reg = 1;
                        else if (c.R > c.B + 15 && lum > 110) reg = 2; // Tiny sliver of neck skin
                        else reg = 4; // Undershirt collar
                    }
                    // Leather glove region (right side above sleeve: x >= 198, y: 102..210)
                    else if (x >= 198 && y >= 102 && y <= 210 && (c.R > c.B + 8 || lum < 120)) {
                        if (lum > 145 && (maxC - minC) < 35) {
                            reg = 5; // White right sleeve
                        } else if (lum < 24) {
                            reg = 1;
                        } else {
                            reg = 2; // Brown leather glove & fingers
                        }
                    }
                    // Undershirt sleeves (left arm y: 230..278, x < 100; right arm y: 205..278, x > 220)
                    else if (y >= 205 && y <= 280 && ((x < 100) || (x > 220)) && lum < 130 && (c.B >= c.R - 5)) {
                        if (lum < 20) reg = 1;
                        else reg = 4; // Undershirt sleeves
                    }
                    // Belt (y: 311..329)
                    else if (y >= 311 && y <= 329) {
                        if (lum < 120) reg = 1; // Black leather belt
                        else reg = 5; // White belt loops
                    }
                    // Jersey Shirt (y: 120..310)
                    else if (y >= 120 && y <= 310) {
                        if (lum < 65) reg = 1; // Crisp seam/fold outlines
                        else reg = 5; // Shirt fabric
                    }
                    // Jersey Pants (y: 330..592)
                    else if (y >= 330 && y <= 592) {
                        if (lum < 65) reg = 1; // Pants outline / creases
                        else reg = 6; // Pants fabric
                    }
                    // Socks & Stirrups (y: 593..675)
                    else if (y >= 593 && y <= 675) {
                        if (lum < 18) reg = 1; // Outline
                        else if (lum > 175) reg = 2; // White under-sock at ankle
                        else reg = 7; // Navy socks
                    }
                    // Cleats / Spikes (y > 675)
                    else {
                        reg = 1;
                    }

                    regionMap[x, y] = reg;

                    if (reg == 5 || reg == 6) {
                        int normLum = Math.Min(255, (int)(lum * 1.03));
                        baseSprite.SetPixel(x, y, Color.FromArgb(255, normLum, normLum, normLum));
                    } else if (reg == 3 || reg == 4 || reg == 7) {
                        int boostLum = Math.Min(245, Math.Max(135, 125 + lum * 2));
                        baseSprite.SetPixel(x, y, Color.FromArgb(255, boostLum, boostLum, boostLum));
                    } else {
                        baseSprite.SetPixel(x, y, Color.FromArgb(255, c.R, c.G, c.B));
                    }

                    Color maskCol = Color.FromArgb(255, 40, 40, 40);
                    if (reg == 1) maskCol = Color.FromArgb(255, 20, 20, 20);
                    else if (reg == 2) maskCol = Color.FromArgb(255, 210, 160, 120);
                    else if (reg == 3) maskCol = Color.FromArgb(255, 255, 50, 50);
                    else if (reg == 4) maskCol = Color.FromArgb(255, 0, 220, 255);
                    else if (reg == 5) maskCol = Color.FromArgb(255, 50, 230, 80);
                    else if (reg == 6) maskCol = Color.FromArgb(255, 60, 110, 255);
                    else if (reg == 7) maskCol = Color.FromArgb(255, 240, 60, 240);

                    maskSprite.SetPixel(x, y, maskCol);
                }
            }

            baseSprite.Save(outDir + "/pitcher_base_blank.png", ImageFormat.Png);
            maskSprite.Save(outDir + "/pitcher_color_mask.png", ImageFormat.Png);

            // 4. Create Proof Sheet showing Base + Mask + 3 Uniform/Number Variants
            int sheetW = 1440, sheetH = 820;
            using (Bitmap proof = new Bitmap(sheetW, sheetH, PixelFormat.Format32bppArgb))
            using (Graphics g = Graphics.FromImage(proof)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                g.Clear(Color.FromArgb(255, 15, 23, 42));

                for (int py = 75; py < sheetH - 25; py += 16) {
                    for (int px = 20; px < sheetW - 20; px += 16) {
                        bool even = ((px / 16) + (py / 16)) % 2 == 0;
                        using (Brush b = new SolidBrush(even ? Color.FromArgb(255, 30, 41, 59) : Color.FromArgb(255, 22, 30, 46))) {
                            g.FillRectangle(b, px, py, 16, 16);
                        }
                    }
                }

                Font titleFont = new Font("Meiryo", 15, FontStyle.Bold);
                Font subFont = new Font("Meiryo", 10.5f, FontStyle.Bold);
                g.DrawString("[ Proof of Engine Pipeline ] Raw Base Sprite (Blank Back) + Color ID Mask -> Dynamic Uniforms & Numbers", titleFont, Brushes.Gold, 24, 22);

                DrawLabeledSprite(g, baseSprite, 25, 85, 0.88f, "1. Raw Base PNG (Blank Back)", "pitcher_base_blank.png (Alpha=0 BG)", subFont);
                DrawLabeledSprite(g, maskSprite, 305, 85, 0.88f, "2. Color ID Mask PNG", "R:Cap C:Under G:Shirt B:Pants M:Socks", subFont);

                using (Bitmap v1 = RenderVariant(baseSprite, regionMap,
                    Color.FromArgb(25, 42, 78),
                    Color.FromArgb(25, 42, 78),
                    Color.FromArgb(246, 238, 216),
                    Color.FromArgb(246, 238, 216),
                    Color.FromArgb(25, 42, 78),
                    "ACCENT_LINE", Color.FromArgb(25, 42, 78), "1", true)) {
                    DrawLabeledSprite(g, v1, 585, 85, 0.88f, "3. Output A: Ivory + 1-Line", "Navy Cap/Under + Jersey #1 (Ace)", subFont);
                }

                using (Bitmap v2 = RenderVariant(baseSprite, regionMap,
                    Color.FromArgb(22, 24, 30),
                    Color.FromArgb(190, 24, 38),
                    Color.FromArgb(248, 250, 252),
                    Color.FromArgb(248, 250, 252),
                    Color.FromArgb(22, 24, 30),
                    "PINSTRIPE", Color.FromArgb(30, 35, 45), "10", true)) {
                    DrawLabeledSprite(g, v2, 865, 85, 0.88f, "4. Output B: Pinstripe + Red", "Black Cap + Red Under + #10 (Relief)", subFont);
                }

                using (Bitmap v3 = RenderVariant(baseSprite, regionMap,
                    Color.FromArgb(155, 28, 42),
                    Color.FromArgb(155, 28, 42),
                    Color.FromArgb(212, 234, 252),
                    Color.FromArgb(245, 247, 250),
                    Color.FromArgb(155, 28, 42),
                    "NORMAL", Color.FromArgb(155, 28, 42), "18", false)) {
                    DrawLabeledSprite(g, v3, 1145, 85, 0.88f, "5. Output C: SkyBlue + Crimson", "Two-Tone Shirt/Pants + Direct #18", subFont);
                }

                proof.Save(outDir + "/uniform_and_number_proof.png", ImageFormat.Png);
            }
        }
    }

    private static void DrawLabeledSprite(Graphics g, Bitmap bmp, int x, int y, float scale, string title, string sub, Font font) {
        int dw = (int)(bmp.Width * scale);
        int dh = (int)(bmp.Height * scale);
        using (Pen p = new Pen(Color.FromArgb(140, 100, 116, 139), 1.5f)) {
            g.DrawRectangle(p, x - 4, y - 4, dw + 8, dh + 58);
        }
        g.DrawImage(bmp, new Rectangle(x, y, dw, dh));
        using (Brush bg = new SolidBrush(Color.FromArgb(230, 15, 23, 42))) {
            g.FillRectangle(bg, x - 3, y + dh, dw + 6, 52);
        }
        g.DrawString(title, font, Brushes.White, x + 4, y + dh + 4);
        using (Font smallFont = new Font("Meiryo", 9.0f, FontStyle.Regular)) {
            g.DrawString(sub, smallFont, Brushes.LightSkyBlue, x + 4, y + dh + 28);
        }
    }

    public static Bitmap RenderVariant(
        Bitmap baseSprite, byte[,] regionMap,
        Color capCol, Color underCol, Color shirtCol, Color pantsCol, Color socksCol,
        string pattern, Color lineCol, string jerseyNum, bool withWhitePatch
    ) {
        int W = baseSprite.Width, H = baseSprite.Height;
        Bitmap outBmp = new Bitmap(W, H, PixelFormat.Format32bppArgb);

        for (int y = 0; y < H; y++) {
            for (int x = 0; x < W; x++) {
                byte reg = regionMap[x, y];
                if (reg == 0) {
                    outBmp.SetPixel(x, y, Color.FromArgb(0, 0, 0, 0));
                    continue;
                }
                Color bCol = baseSprite.GetPixel(x, y);
                float shade = bCol.R / 255.0f;

                if (reg == 1 || reg == 2) {
                    outBmp.SetPixel(x, y, bCol);
                } else if (reg == 3) {
                    outBmp.SetPixel(x, y, MultiplyColor(capCol, shade));
                } else if (reg == 4) {
                    outBmp.SetPixel(x, y, MultiplyColor(underCol, shade));
                } else if (reg == 5) {
                    Color target = shirtCol;
                    if (pattern == "PINSTRIPE" && (x % 9 == 0 || x % 9 == 1)) {
                        target = lineCol;
                    } else if (pattern == "ACCENT_LINE") {
                        if (Math.Abs(x - 142) <= 2 || (y >= 146 && y <= 151)) {
                            target = lineCol;
                        }
                    }
                    outBmp.SetPixel(x, y, MultiplyColor(target, shade));
                } else if (reg == 6) {
                    Color target = pantsCol;
                    if (pattern == "PINSTRIPE" && (x % 9 == 0 || x % 9 == 1)) {
                        target = lineCol;
                    } else if (pattern == "ACCENT_LINE") {
                        if ((x >= 72 && x <= 77) || (x >= 218 && x <= 223)) {
                            target = lineCol;
                        }
                    }
                    outBmp.SetPixel(x, y, MultiplyColor(target, shade));
                } else if (reg == 7) {
                    Color target = socksCol;
                    if ((y >= 610 && y <= 616) || (y >= 624 && y <= 630)) {
                        target = Color.FromArgb(245, 245, 245);
                    }
                    outBmp.SetPixel(x, y, MultiplyColor(target, shade));
                }
            }
        }

        using (Graphics g = Graphics.FromImage(outBmp)) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

            int patchX = 100, patchY = 172, patchW = 84, patchH = 86;
            if (withWhitePatch) {
                using (Brush wb = new SolidBrush(Color.FromArgb(250, 250, 248)))
                using (Pen bp = new Pen(Color.FromArgb(30, 41, 59), 2.2f)) {
                    g.FillRectangle(wb, patchX, patchY, patchW, patchH);
                    g.DrawRectangle(bp, patchX, patchY, patchW, patchH);
                }
            }

            float fontSize = jerseyNum.Length > 1 ? 40f : 52f;
            using (Font numFont = new Font("Impact", fontSize, FontStyle.Bold))
            using (StringFormat sf = new StringFormat()) {
                sf.Alignment = StringAlignment.Center;
                sf.LineAlignment = StringAlignment.Center;
                RectangleF rect = new RectangleF(patchX, patchY + 2, patchW, patchH);
                using (Brush nb = new SolidBrush(Color.FromArgb(20, 24, 32))) {
                    g.DrawString(jerseyNum, numFont, nb, rect, sf);
                }
            }
        }

        return outBmp;
    }

    private static Color MultiplyColor(Color baseCol, float shade) {
        int r = Math.Min(255, Math.Max(0, (int)(baseCol.R * shade)));
        int g = Math.Min(255, Math.Max(0, (int)(baseCol.G * shade)));
        int b = Math.Min(255, Math.Max(0, (int)(baseCol.B * shade)));
        return Color.FromArgb(255, r, g, b);
    }
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing
New-Item -ItemType Directory -Force -Path "public/assets/sprites" | Out-Null
[SpriteProcessor]::ProcessPitcherFromSample("doc/images/match_characters_sample.jpg", "public/assets/sprites")
Write-Output "Done processing pitcher sprites v3!"
