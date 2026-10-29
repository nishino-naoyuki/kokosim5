Add-Type -AssemblyName System.Drawing

$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public class PitchingFormProcessor {
    // Region IDs:
    // 0: Transparent BG
    // 1: Dark Outline / Black Cleats / Belt / Hair
    // 2: Skin / Leather Glove / White Baseball (Preserved RGB)
    // 3: Cap (Red in mask)
    // 4: Undershirt (Cyan in mask)
    // 5: Jersey Shirt (Green in mask)
    // 6: Jersey Pants (Blue in mask)
    // 7: Socks (Magenta in mask)

    public static void ProcessAllForms(string inputPath, string outDir) {
        using (Bitmap src = new Bitmap(inputPath)) {
            int W = src.Width, H = src.Height;

            // 1. Exterior + Enclosed Studio Background Detection
            // Studio background is uniform warm beige around (220, 207, 188)
            bool[,] isBg = new bool[W, H];
            Queue<Point> q = new Queue<Point>();

            for (int x = 0; x < W; x++) {
                q.Enqueue(new Point(x, 0)); isBg[x, 0] = true;
                q.Enqueue(new Point(x, H - 1)); isBg[x, H - 1] = true;
            }
            for (int y = 0; y < H; y++) {
                q.Enqueue(new Point(0, y)); isBg[0, y] = true;
                q.Enqueue(new Point(W - 1, y)); isBg[W - 1, y] = true;
            }

            // Also seed enclosed arm-body loops (between left glove arm and torso) if they match studio BG
            for (int y = 200; y < 650; y += 10) {
                for (int x = 40; x < W - 40; x += 10) {
                    if (!isBg[x, y]) {
                        Color c = src.GetPixel(x, y);
                        int diff = Math.Abs(c.R - 220) + Math.Abs(c.G - 207) + Math.Abs(c.B - 188);
                        if (diff <= 14) {
                            isBg[x, y] = true;
                            q.Enqueue(new Point(x, y));
                        }
                    }
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

                    Color c = src.GetPixel(nx, ny);
                    int bgDiff = Math.Abs(c.R - 220) + Math.Abs(c.G - 207) + Math.Abs(c.B - 188);
                    bool isDarkOutline = (c.R < 85 && c.G < 85 && c.B < 95);

                    // Flood through studio beige up to the dark outline
                    // Never flood into white uniform (white uniform has B > 205 and R - B < 15)
                    bool isWhiteUniform = (c.B > 200 && (c.R - c.B) < 16);
                    if (!isDarkOutline && !isWhiteUniform && bgDiff < 55) {
                        isBg[nx, ny] = true;
                        q.Enqueue(new Point(nx, ny));
                    }
                }
            }

            Bitmap baseSheet = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            Bitmap maskSheet = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            byte[,] regionMap = new byte[W, H];

            for (int y = 0; y < H; y++) {
                for (int x = 0; x < W; x++) {
                    if (isBg[x, y]) {
                        baseSheet.SetPixel(x, y, Color.FromArgb(0, 0, 0, 0));
                        maskSheet.SetPixel(x, y, Color.FromArgb(0, 0, 0, 0));
                        regionMap[x, y] = 0;
                        continue;
                    }

                    Color c = src.GetPixel(x, y);
                    int lum = (int)(0.299 * c.R + 0.587 * c.G + 0.114 * c.B);
                    int maxC = Math.Max(c.R, Math.Max(c.G, c.B));
                    int minC = Math.Min(c.R, Math.Min(c.G, c.B));

                    // Determine which of the 4 figures (0..3) this pixel belongs to
                    int fig = 0;
                    if (x < 355) fig = 0;
                    else if (x < 660 && !(x >= 595 && y >= 540)) fig = 1;
                    else if (x < 1042) fig = 2;
                    else fig = 3;

                    // Determine belt Y line for this figure
                    int beltY = 380;
                    int capMaxY = 192;
                    int sockMinY = 555;
                    int cleatMinY = 635;
                    if (fig == 0) {
                        beltY = 382; capMaxY = 190; sockMinY = 558; cleatMinY = 612;
                    } else if (fig == 1) {
                        beltY = 394; capMaxY = 232; sockMinY = 545; cleatMinY = 605;
                    } else if (fig == 2) {
                        beltY = 442; capMaxY = 264; sockMinY = 572; cleatMinY = 635;
                    } else {
                        // Submarine: belt slopes down to the right
                        beltY = 472 + (int)((x - 1110) * 0.18);
                        capMaxY = 365; sockMinY = 575; cleatMinY = 600;
                    }

                    byte reg = 2;

                    // Check if white/grey fabric (Jersey Shirt, Pants, or Baseball in hand)
                    bool isWhiteFabric = (lum > 150 && (maxC - minC) < 35);
                    // Check if dark navy fabric (Cap, Undershirt, Socks)
                    bool isNavyFabric = (!isWhiteFabric && c.B >= c.R + 4 && lum >= 18 && lum <= 135);
                    // Check if warm skin or brown leather glove
                    bool isSkinOrGlove = (c.R > c.B + 16 && lum >= 38);

                    if (lum < 24 && (c.B - c.R) < 6) {
                        reg = 1; // Crisp black outline / hair / cleats / belt
                    } else if (Math.Abs(y - beltY) <= 13 && lum < 85) {
                        reg = 1; // Black leather belt
                    } else if (isSkinOrGlove) {
                        reg = 2; // Skin (throwing hand/neck) or Brown Leather Glove
                    } else if (isNavyFabric) {
                        // Separate Cap vs Undershirt vs Socks by Y position
                        bool isCapPos = (y <= capMaxY) &&
                            ((fig == 0 && x >= 95 && x <= 195) ||
                             (fig == 1 && x >= 435 && x <= 545) ||
                             (fig == 2 && x >= 765 && x <= 865) ||
                             (fig == 3 && x >= 1210 && x <= 1315));
                        if (isCapPos) {
                            reg = 3; // Cap
                        } else if (y >= sockMinY) {
                            // In Submarine (fig 3), right throwing sleeve reaches down to y=605 at x >= 1255!
                            if (fig == 3 && x >= 1245) {
                                reg = 4; // Submarine low throwing arm undershirt sleeve!
                            } else if (y >= cleatMinY && c.B - c.R < 10 && lum < 55) {
                                reg = 1; // Black cleats
                            } else {
                                reg = 7; // Socks
                            }
                        } else {
                            reg = 4; // Undershirt (collar & sleeves)
                        }
                    } else if (isWhiteFabric) {
                        // Exclude the baseball in the throwing hand!
                        bool isBaseballInHand =
                            (fig == 0 && y < 120 && x > 240) ||
                            (fig == 1 && y < 210 && x > 575) ||
                            (fig == 2 && x > 955 && y < 420) ||
                            (fig == 3 && x > 1270 && y > 570);
                        if (isBaseballInHand) {
                            reg = 2; // Keep white baseball untouched
                        } else if (y < beltY) {
                            reg = 5; // Jersey Shirt
                        } else {
                            reg = 6; // Jersey Pants
                        }
                    } else {
                        // Remaining dark tones (hair, belt, cleats, dark outlines)
                        reg = 1;
                    }

                    regionMap[x, y] = reg;

                    if (reg == 5 || reg == 6) {
                        int normLum = Math.Min(255, (int)(lum * 1.03));
                        baseSheet.SetPixel(x, y, Color.FromArgb(255, normLum, normLum, normLum));
                    } else if (reg == 3 || reg == 4 || reg == 7) {
                        int boostLum = Math.Min(245, Math.Max(135, 120 + lum * 2));
                        baseSheet.SetPixel(x, y, Color.FromArgb(255, boostLum, boostLum, boostLum));
                    } else {
                        baseSheet.SetPixel(x, y, Color.FromArgb(255, c.R, c.G, c.B));
                    }

                    Color maskCol = Color.FromArgb(255, 40, 40, 40);
                    if (reg == 1) maskCol = Color.FromArgb(255, 20, 20, 20);
                    else if (reg == 2) maskCol = Color.FromArgb(255, 210, 160, 120);
                    else if (reg == 3) maskCol = Color.FromArgb(255, 255, 50, 50);
                    else if (reg == 4) maskCol = Color.FromArgb(255, 0, 220, 255);
                    else if (reg == 5) maskCol = Color.FromArgb(255, 50, 230, 80);
                    else if (reg == 6) maskCol = Color.FromArgb(255, 60, 110, 255);
                    else if (reg == 7) maskCol = Color.FromArgb(255, 240, 60, 240);

                    maskSheet.SetPixel(x, y, maskCol);
                }
            }

            baseSheet.Save(outDir + "/pitching_forms_base_blank.png", ImageFormat.Png);
            maskSheet.Save(outDir + "/pitching_forms_color_mask.png", ImageFormat.Png);

            // Render custom uniforms & numbers onto the 4 forms:
            // Form 0 (Overhand): Ivory + Navy 1-Line + #1 (White patch)
            // Form 1 (Three-Quarters): White + Pinstripe + Red Undershirt + #10 (White patch)
            // Form 2 (Sidearm): Cream + Dark Green Cap/Under/Socks + #11 (Direct number)
            // Form 3 (Submarine): SkyBlue Shirt + White Pants + Crimson Cap/Under + #18 (Direct number)
            Bitmap coloredForms = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            for (int y = 0; y < H; y++) {
                for (int x = 0; x < W; x++) {
                    byte reg = regionMap[x, y];
                    if (reg == 0) {
                        coloredForms.SetPixel(x, y, Color.FromArgb(0, 0, 0, 0));
                        continue;
                    }
                    Color bCol = baseSheet.GetPixel(x, y);
                    float shade = bCol.R / 255.0f;

                    int fig = 0;
                    if (x < 355) fig = 0;
                    else if (x < 660 && !(x >= 595 && y >= 540)) fig = 1;
                    else if (x < 1042) fig = 2;
                    else fig = 3;

                    Color capCol = Color.FromArgb(25, 42, 78);
                    Color underCol = Color.FromArgb(25, 42, 78);
                    Color shirtCol = Color.FromArgb(246, 238, 216);
                    Color pantsCol = Color.FromArgb(246, 238, 216);
                    Color socksCol = Color.FromArgb(25, 42, 78);
                    string pattern = "ACCENT_LINE";
                    Color lineCol = Color.FromArgb(25, 42, 78);

                    if (fig == 1) {
                        capCol = Color.FromArgb(22, 24, 30);
                        underCol = Color.FromArgb(190, 24, 38);
                        shirtCol = Color.FromArgb(248, 250, 252);
                        pantsCol = Color.FromArgb(248, 250, 252);
                        socksCol = Color.FromArgb(22, 24, 30);
                        pattern = "PINSTRIPE";
                        lineCol = Color.FromArgb(30, 35, 45);
                    } else if (fig == 2) {
                        capCol = Color.FromArgb(18, 78, 52);
                        underCol = Color.FromArgb(18, 78, 52);
                        shirtCol = Color.FromArgb(248, 244, 228);
                        pantsCol = Color.FromArgb(248, 244, 228);
                        socksCol = Color.FromArgb(18, 78, 52);
                        pattern = "NORMAL";
                    } else if (fig == 3) {
                        capCol = Color.FromArgb(155, 28, 42);
                        underCol = Color.FromArgb(155, 28, 42);
                        shirtCol = Color.FromArgb(210, 232, 252);
                        pantsCol = Color.FromArgb(248, 250, 252);
                        socksCol = Color.FromArgb(155, 28, 42);
                        pattern = "NORMAL";
                    }

                    if (reg == 1 || reg == 2) {
                        coloredForms.SetPixel(x, y, bCol);
                    } else if (reg == 3) {
                        coloredForms.SetPixel(x, y, MultiplyColor(capCol, shade));
                    } else if (reg == 4) {
                        coloredForms.SetPixel(x, y, MultiplyColor(underCol, shade));
                    } else if (reg == 5) {
                        Color target = shirtCol;
                        if (pattern == "PINSTRIPE" && ((x + y / 6) % 9 <= 1)) {
                            target = lineCol;
                        } else if (pattern == "ACCENT_LINE" && Math.Abs((x - 160) + (y - 290) / 7) <= 2) {
                            target = lineCol;
                        }
                        coloredForms.SetPixel(x, y, MultiplyColor(target, shade));
                    } else if (reg == 6) {
                        Color target = pantsCol;
                        if (pattern == "PINSTRIPE" && (x % 9 <= 1)) {
                            target = lineCol;
                        }
                        coloredForms.SetPixel(x, y, MultiplyColor(target, shade));
                    } else if (reg == 7) {
                        coloredForms.SetPixel(x, y, MultiplyColor(socksCol, shade));
                    }
                }
            }

            // Draw rotated back jersey numbers aligned to each pitching form's torso angle!
            using (Graphics g = Graphics.FromImage(coloredForms)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

                DrawRotatedBackNumber(g, 156, 305, -9f, "1", true);
                DrawRotatedBackNumber(g, 480, 325, -11f, "10", true);
                DrawRotatedBackNumber(g, 810, 368, -4f, "11", false);
                DrawRotatedBackNumber(g, 1185, 415, 20f, "18", false);
            }

            coloredForms.Save(outDir + "/pitching_forms_colored_output.png", ImageFormat.Png);

            // Build a single comprehensive Proof Sheet showing:
            // Top Row: 1. Raw Transparent Base PNG (pitching_forms_base_blank.png)
            // Middle Row: 2. Color ID Mask PNG (pitching_forms_color_mask.png)
            // Bottom Row: 3. Dynamic Uniform + Rotated Back Number Output
            int proofW = 1420, proofH = 1140;
            using (Bitmap proof = new Bitmap(proofW, proofH, PixelFormat.Format32bppArgb))
            using (Graphics g = Graphics.FromImage(proof)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                g.Clear(Color.FromArgb(255, 15, 23, 42));

                // Draw checkerboard background in 3 rows
                int[] rowY = { 55, 415, 775 };
                string[] rowTitles = {
                    "1. Raw Base Sprite Sheet (pitching_forms_base_blank.png) - Alpha=0 Transparent BG, Blank Back, 4 Arm Slots",
                    "2. Color ID Mask Sheet (pitching_forms_color_mask.png) - R:Cap  C:Undershirt  G:Shirt  B:Pants  M:Socks",
                    "3. Engine Output: Custom School Uniforms + Torso-Aligned Back Numbers (#1 Overhand, #10 3/4, #11 Sidearm, #18 Submarine)"
                };
                Bitmap[] sheets = { baseSheet, maskSheet, coloredForms };

                Font headerFont = new Font("Meiryo", 12.5f, FontStyle.Bold);
                for (int r = 0; r < 3; r++) {
                    int ry = rowY[r];
                    int rh = 315;
                    for (int py = ry; py < ry + rh; py += 16) {
                        for (int px = 20; px < proofW - 20; px += 16) {
                            bool even = ((px / 16) + (py / 16)) % 2 == 0;
                            using (Brush b = new SolidBrush(even ? Color.FromArgb(255, 30, 41, 59) : Color.FromArgb(255, 22, 30, 46))) {
                                g.FillRectangle(b, px, py, 16, Math.Min(16, ry + rh - py));
                            }
                        }
                    }
                    using (Pen p = new Pen(Color.FromArgb(140, 100, 116, 139), 1.5f)) {
                        g.DrawRectangle(p, 20, ry, proofW - 40, rh);
                    }
                    g.DrawString(rowTitles[r], headerFont, Brushes.Gold, 22, ry - 26);

                    // Draw scaled sheet (from 1376x768 cropped y:35..710 -> 1376x675 into 640x314 or full width)
                    g.DrawImage(sheets[r], new Rectangle(120, ry + 2, 1180, rh - 4), new Rectangle(0, 35, W, 675), GraphicsUnit.Pixel);
                }

                proof.Save(outDir + "/pitching_forms_proof.png", ImageFormat.Png);
            }

            baseSheet.Dispose();
            maskSheet.Dispose();
            coloredForms.Dispose();
        }
    }

    private static void DrawRotatedBackNumber(Graphics g, float cx, float cy, float angleDeg, string num, bool withPatch) {
        GraphicsState state = g.Save();
        g.TranslateTransform(cx, cy);
        g.RotateTransform(angleDeg);

        float pw = 66f, ph = 68f;
        if (withPatch) {
            using (Brush wb = new SolidBrush(Color.FromArgb(248, 248, 245)))
            using (Pen bp = new Pen(Color.FromArgb(30, 41, 59), 1.8f)) {
                g.FillRectangle(wb, -pw / 2, -ph / 2, pw, ph);
                g.DrawRectangle(bp, -pw / 2, -ph / 2, pw, ph);
            }
        }
        float fontSize = num.Length > 1 ? 32f : 40f;
        using (Font f = new Font("Impact", fontSize, FontStyle.Bold))
        using (StringFormat sf = new StringFormat()) {
            sf.Alignment = StringAlignment.Center;
            sf.LineAlignment = StringAlignment.Center;
            using (Brush nb = new SolidBrush(Color.FromArgb(20, 24, 32))) {
                g.DrawString(num, f, nb, new RectangleF(-pw / 2, -ph / 2 + 2, pw, ph), sf);
            }
        }
        g.Restore(state);
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
[PitchingFormProcessor]::ProcessAllForms("doc/images/pitching_forms_raw_source.jpg", "public/assets/sprites")
Write-Output "Done processing all 4 pitching forms!"
