Add-Type -AssemblyName System.Drawing

$code = @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public class LeftHandedProofGenerator {
    public static void GenerateLeftyProof(string outDir) {
        using (Bitmap baseSheet = new Bitmap(outDir + "/pitching_forms_base_blank.png"))
        using (Bitmap maskSheet = new Bitmap(outDir + "/pitching_forms_color_mask.png")) {
            int W = baseSheet.Width, H = baseSheet.Height;

            // Define crop boxes for the 4 forms in the 1376x768 sheet:
            // 0: Overhand, 1: Three-Quarters, 2: Sidearm, 3: Submarine
            Rectangle[] crops = new Rectangle[] {
                new Rectangle(25, 35, 325, 675),
                new Rectangle(350, 95, 370, 615),
                new Rectangle(595, 195, 502, 515),
                new Rectangle(1012, 315, 358, 395)
            };
            // Back number center relative to the original 1376x768 sheet & angle
            float[] numCX = { 156f, 480f, 810f, 1185f };
            float[] numCY = { 305f, 325f, 368f, 415f };
            float[] numAngle = { -9f, -11f, -4f, 20f };
            string[] nums = { "1", "10", "11", "18" };
            bool[] patches = { true, true, false, false };

            int proofW = 1420, proofH = 880;
            using (Bitmap proof = new Bitmap(proofW, proofH, PixelFormat.Format32bppArgb))
            using (Graphics g = Graphics.FromImage(proof)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                g.Clear(Color.FromArgb(255, 15, 23, 42));

                int[] rowY = { 55, 465 };
                string[] rowTitles = {
                    "1. Right-Handed Pitcher (throws = 'R') : Glove on Left Hand, Release from Right Arm + Normal Back Number",
                    "2. Left-Handed Pitcher (throws = 'L') : Blank Base + Mask Flipped FIRST -> Normal (Un-mirrored) Number Drawn AFTER"
                };

                Font headerFont = new Font("Meiryo", 12.5f, FontStyle.Bold);
                Font labelFont = new Font("Meiryo", 10.5f, FontStyle.Bold);

                for (int row = 0; row < 2; row++) {
                    bool isLefty = (row == 1);
                    int ry = rowY[row];
                    int rh = 365;

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
                    g.DrawString(rowTitles[row], headerFont, Brushes.Gold, 22, ry - 28);

                    int[] destX = { 45, 355, 675, 1095 };
                    string[] formNames = {
                        isLefty ? "Lefty Overhand (#1)" : "Righty Overhand (#1)",
                        isLefty ? "Lefty Three-Quarters (#10)" : "Righty Three-Quarters (#10)",
                        isLefty ? "Lefty Sidearm (#11)" : "Righty Sidearm (#11)",
                        isLefty ? "Lefty Submarine (#18)" : "Righty Submarine (#18)"
                    };

                    for (int f = 0; f < 4; f++) {
                        using (Bitmap figBmp = RenderSingleForm(baseSheet, maskSheet, crops[f], f, isLefty, numCX[f] - crops[f].X, numCY[f] - crops[f].Y, numAngle[f], nums[f], patches[f])) {
                            float scale = Math.Min(300f / figBmp.Width, 315f / figBmp.Height);
                            if (f == 2) scale = Math.Min(390f / figBmp.Width, 315f / figBmp.Height);
                            int dw = (int)(figBmp.Width * scale);
                            int dh = (int)(figBmp.Height * scale);
                            int dy = ry + (325 - dh) / 2 + 5;
                            g.DrawImage(figBmp, new Rectangle(destX[f], dy, dw, dh));
                            g.DrawString(formNames[f], labelFont, isLefty ? Brushes.LightSkyBlue : Brushes.White, destX[f] + 10, ry + rh - 28);
                        }
                    }
                }

                proof.Save(outDir + "/left_handed_pitcher_proof.png", ImageFormat.Png);
            }
        }
    }

    private static Bitmap RenderSingleForm(
        Bitmap baseSheet, Bitmap maskSheet, Rectangle crop, int fig, bool isLefty,
        float localCX, float localCY, float angleDeg, string num, bool withPatch
    ) {
        int cw = crop.Width, ch = crop.Height;
        Bitmap outBmp = new Bitmap(cw, ch, PixelFormat.Format32bppArgb);

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

        for (int y = 0; y < ch; y++) {
            for (int x = 0; x < cw; x++) {
                // Step 1: If Left-Handed, sample horizontally mirrored coordinate from Blank Base & Mask!
                int srcX = crop.X + (isLefty ? (cw - 1 - x) : x);
                int srcY = crop.Y + y;

                // Avoid cross-figure bleed in overlapping corners
                if (fig == 1 && ((srcX >= 595 && srcY >= 540) || (srcX >= 690 && srcY >= 280))) continue;
                if (fig == 2 && ((srcX < 660 && srcY < 540) || (srcX >= 1010 && srcY >= 350))) continue;
                if (fig == 3 && srcX < 1100 && srcY < 350) continue;

                Color mCol = maskSheet.GetPixel(srcX, srcY);
                if (mCol.A == 0) {
                    outBmp.SetPixel(x, y, Color.FromArgb(0, 0, 0, 0));
                    continue;
                }

                Color bCol = baseSheet.GetPixel(srcX, srcY);
                float shade = bCol.R / 255.0f;

                // Decode region from exact mask color
                int reg = 1;
                if (mCol.R == 255 && mCol.G == 50 && mCol.B == 50) reg = 3; // Red: Cap
                else if (mCol.R == 0 && mCol.G == 220 && mCol.B == 255) reg = 4; // Cyan: Undershirt
                else if (mCol.R == 50 && mCol.G == 230 && mCol.B == 80) reg = 5; // Green: Shirt
                else if (mCol.R == 60 && mCol.G == 110 && mCol.B == 255) reg = 6; // Blue: Pants
                else if (mCol.R == 240 && mCol.G == 60 && mCol.B == 240) reg = 7; // Magenta: Socks
                else if (mCol.R == 210 && mCol.G == 160 && mCol.B == 120) reg = 2; // Skin/Glove/Ball

                if (reg == 1 || reg == 2) {
                    outBmp.SetPixel(x, y, bCol);
                } else if (reg == 3) {
                    outBmp.SetPixel(x, y, MultiplyColor(capCol, shade));
                } else if (reg == 4) {
                    outBmp.SetPixel(x, y, MultiplyColor(underCol, shade));
                } else if (reg == 5) {
                    Color target = shirtCol;
                    if (pattern == "PINSTRIPE" && ((srcX + srcY / 6) % 9 <= 1)) {
                        target = lineCol;
                    } else if (pattern == "ACCENT_LINE" && Math.Abs((srcX - 160) + (srcY - 290) / 7) <= 2) {
                        target = lineCol;
                    }
                    outBmp.SetPixel(x, y, MultiplyColor(target, shade));
                } else if (reg == 6) {
                    Color target = pantsCol;
                    if (pattern == "PINSTRIPE" && (srcX % 9 <= 1)) {
                        target = lineCol;
                    }
                    outBmp.SetPixel(x, y, MultiplyColor(target, shade));
                } else if (reg == 7) {
                    outBmp.SetPixel(x, y, MultiplyColor(socksCol, shade));
                }
            }
        }

        // Step 2: Draw Back Number AFTER flipping so the digits ("10", "18", etc.) are NEVER reversed!
        using (Graphics g = Graphics.FromImage(outBmp)) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

            float finalCX = isLefty ? (cw - localCX) : localCX;
            float finalAngle = isLefty ? -angleDeg : angleDeg;

            GraphicsState state = g.Save();
            g.TranslateTransform(finalCX, localCY);
            g.RotateTransform(finalAngle);

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
[LeftHandedProofGenerator]::GenerateLeftyProof("public/assets/sprites")
Write-Output "Done generating left-handed pitcher proof!"
