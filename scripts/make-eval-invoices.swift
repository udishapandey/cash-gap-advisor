// Draws the three extra SYNTHETIC test invoices used by `npm run eval:extract` (macOS only: needs AppKit).
//   swift scripts/make-eval-invoices.swift
// It writes:
//   public/samples/invoice-hidden-discount.pdf   early-payment discount buried in footer fine print
//   public/samples/invoice-latefee.pdf           late fee only, no discount, terms "due within 15 days", two line items
//   public/samples/invoice-hindi-mixed.png       mixed Hindi-English labels, handwritten-looking
//   eval/printed-text/<name>.txt                 exactly the text that was printed, one line per item, for checking quotes
// Every name, address and bank detail is made up. Nothing here is a real invoice.

import AppKit
import CoreGraphics

// ---------- helpers ----------

var printed: [String] = []

func font(_ names: [String], _ size: CGFloat) -> NSFont {
    for n in names { if let f = NSFont(name: n, size: size) { return f } }
    return NSFont.systemFont(ofSize: size)
}

func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor { NSColor(deviceRed: r, green: g, blue: b, alpha: a) }

/// Draw text with its top-left at (x, y) in a top-left-origin page. `width` lets right/centre alignment work.
func text(_ s: String, _ f: NSFont, x: CGFloat, y: CGFloat, c: NSColor = .black, align: NSTextAlignment = .left, width: CGFloat = 900, record: Bool = true) {
    let style = NSMutableParagraphStyle()
    style.alignment = align
    (s as NSString).draw(in: NSRect(x: x, y: y, width: width, height: f.pointSize * 2),
                         withAttributes: [.font: f, .foregroundColor: c, .paragraphStyle: style])
    if record { printed.append(s) }
}

func rect(_ r: NSRect, fill: NSColor? = nil, stroke: NSColor? = nil, line: CGFloat = 1) {
    if let fill = fill { fill.setFill(); NSBezierPath(rect: r).fill() }
    if let stroke = stroke { stroke.setStroke(); let p = NSBezierPath(rect: r); p.lineWidth = line; p.stroke() }
}

func hline(_ x1: CGFloat, _ x2: CGFloat, y: CGFloat, c: NSColor = .gray, w: CGFloat = 0.6) {
    c.setStroke(); let p = NSBezierPath(); p.move(to: NSPoint(x: x1, y: y)); p.line(to: NSPoint(x: x2, y: y)); p.lineWidth = w; p.stroke()
}

func vline(_ x: CGFloat, _ y1: CGFloat, _ y2: CGFloat, c: NSColor = .gray, w: CGFloat = 0.6) {
    c.setStroke(); let p = NSBezierPath(); p.move(to: NSPoint(x: x, y: y1)); p.line(to: NSPoint(x: x, y: y2)); p.lineWidth = w; p.stroke()
}

func writePrinted(_ name: String) {
    let dir = "eval/printed-text"
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    try? (printed.joined(separator: "\n") + "\n").write(toFile: "\(dir)/\(name).txt", atomically: true, encoding: .utf8)
    printed = []
}

func makePDF(_ path: String, width w: CGFloat, height h: CGFloat, _ draw: () -> Void) {
    var box = CGRect(x: 0, y: 0, width: w, height: h)
    let g = CGContext(URL(fileURLWithPath: path) as CFURL, mediaBox: &box, nil)!
    g.beginPDFPage(nil)
    g.translateBy(x: 0, y: h)
    g.scaleBy(x: 1, y: -1)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: g, flipped: true)
    draw()
    NSGraphicsContext.restoreGraphicsState()
    g.endPDFPage()
    g.closePDF()
}

// Small seeded random generator so the "random" look is the same every run.
var seed: UInt64 = 20261012
func rnd() -> CGFloat {
    seed = seed &* 6364136223846793005 &+ 1442695040888963407
    return CGFloat((seed >> 33) & 0xFFFFFF) / CGFloat(0xFFFFFF)
}

// ---------- 1. Hidden discount: a serif letterhead invoice, discount only in the footer fine print ----------

func hiddenDiscount() {
    let serif = ["Georgia", "TimesNewRomanPSMT", "Times-Roman"]
    let serifB = ["Georgia-Bold", "TimesNewRomanPS-BoldMT", "Times-Bold"]
    let sans = ["HelveticaNeue", "Helvetica"]
    let ink = color(0.1, 0.1, 0.12)
    let teal = color(0.05, 0.38, 0.40)
    makePDF("public/samples/invoice-hidden-discount.pdf", width: 595, height: 842) {
        // letterhead, centred, with a double rule
        text("SYNTHETIC SAMPLE  |  NOT A REAL INVOICE  |  Created for the Cash Gap Advisor prototype", font(sans, 7), x: 0, y: 14, c: .gray, align: .center, width: 595)
        text("MEHTA LEATHER WORKS LLP", font(serifB, 22), x: 0, y: 36, c: teal, align: .center, width: 595)
        text("Manufacturers of men's and women's footwear", font(serif, 9), x: 0, y: 66, c: ink, align: .center, width: 595)
        text("44, Tannery Road, Jajmau, Kanpur, Uttar Pradesh 208010  |  GSTIN: 00AAAAA0000A0Z0 (fictional)", font(serif, 8), x: 0, y: 80, c: ink, align: .center, width: 595)
        hline(40, 555, y: 98, c: teal, w: 2)
        hline(40, 555, y: 102, c: teal, w: 0.6)
        text("TAX INVOICE", font(serifB, 15), x: 0, y: 112, c: ink, align: .center, width: 595)

        // two boxes: bill to (left) and invoice details (right)
        rect(NSRect(x: 40, y: 142, width: 250, height: 92), stroke: .gray)
        text("Billed to", font(sans, 8), x: 48, y: 148, c: .gray)
        text("Rahul's shoe brand", font(serifB, 12), x: 48, y: 162, c: ink)
        text("Shop 7, Begum Bazaar", font(serif, 9), x: 48, y: 180, c: ink)
        text("Hyderabad, Telangana 500012", font(serif, 9), x: 48, y: 193, c: ink)
        rect(NSRect(x: 305, y: 142, width: 250, height: 92), stroke: .gray)
        let rows: [(String, String)] = [("Invoice No.", "MLW/2627/0318"), ("Invoice Date", "12 Oct 2026"), ("Due Date", "22 Oct 2026"), ("Buyer's PO", "RSB-PO-5521")]
        for (i, r) in rows.enumerated() {
            let y = 150 + CGFloat(i) * 20
            text(r.0, font(sans, 8.5), x: 313, y: y, c: .gray, width: 90)
            text(r.1, font(serifB, 10.5), x: 410, y: y - 1, c: ink, width: 140)
        }

        // items table with S.No, HSN and a single line item
        let top: CGFloat = 256
        rect(NSRect(x: 40, y: top, width: 515, height: 22), fill: teal)
        let white = NSColor.white
        text("S.No", font(sans, 8.5), x: 46, y: top + 6, c: white)
        text("Description of goods", font(sans, 8.5), x: 82, y: top + 6, c: white)
        text("HSN", font(sans, 8.5), x: 285, y: top + 6, c: white)
        text("Qty", font(sans, 8.5), x: 340, y: top + 6, c: white, align: .right, width: 60)
        text("Rate", font(sans, 8.5), x: 405, y: top + 6, c: white, align: .right, width: 60)
        text("Amount", font(sans, 8.5), x: 470, y: top + 6, c: white, align: .right, width: 78)
        text("1", font(serif, 10), x: 50, y: top + 34, c: ink)
        text("Men's casual shoes, style MC-204", font(serif, 10), x: 82, y: top + 34, c: ink)
        text("6403", font(serif, 10), x: 285, y: top + 34, c: ink)
        text("400 pairs", font(serif, 10), x: 340, y: top + 34, c: ink, align: .right, width: 60)
        text("1,250.00", font(serif, 10), x: 405, y: top + 34, c: ink, align: .right, width: 60)
        text("5,00,000.00", font(serif, 10), x: 470, y: top + 34, c: ink, align: .right, width: 78)
        hline(40, 555, y: top + 56, c: .lightGray)
        text("Grand Total", font(serifB, 11), x: 300, y: top + 70, c: ink, align: .right, width: 150)
        text("₹ 5,00,000.00", font(serifB, 12), x: 440, y: top + 69, c: ink, align: .right, width: 108)
        text("(Rupees Five Lakh only. Prices include GST.)", font(serif, 8.5), x: 40, y: top + 72, c: .gray)

        // visible payment terms: the late fee is easy to find, the discount is not
        text("Payment terms", font(sans, 8.5), x: 40, y: 380, c: .gray)
        text("Payment is due by the date shown above. Interest @ 2% per month on overdue amounts.", font(serif, 10), x: 40, y: 394, c: ink)
        text("Bank details", font(sans, 8.5), x: 40, y: 426, c: .gray)
        text("Bank: Synthetic Bank Ltd   A/c name: Mehta Leather Works LLP   A/c no: 0000 0000 0000   IFSC: SYNT0000000", font(serif, 9), x: 40, y: 440, c: ink)

        // signature, then the buried footer: numbered terms in tiny grey type
        hline(400, 555, y: 700, c: .gray)
        text("Authorised signatory (synthetic)", font(sans, 8), x: 400, y: 705, c: .gray, align: .right, width: 155)
        hline(40, 555, y: 752, c: .lightGray)
        let tiny = font(sans, 6)
        let g2 = color(0.55, 0.55, 0.57)
        text("Terms & conditions", font(sans, 6.5), x: 40, y: 758, c: g2)
        text("1. Goods once sold will not be taken back or exchanged.  2. Subject to Kanpur jurisdiction only.", tiny, x: 40, y: 768, c: g2)
        text("3. A cash discount of 2.5% on the invoice value is allowed if payment is received within 5 days of the invoice date.", tiny, x: 40, y: 777, c: g2)
        text("4. Our responsibility ceases when the goods leave our premises.  5. E. & O.E.", tiny, x: 40, y: 786, c: g2)
        text("Synthetic document generated for a prototype. Names, addresses and bank details are fictional.", tiny, x: 40, y: 800, c: g2)
    }
    writePrinted("invoice-hidden-discount")
}

// ---------- 2. Late fee only: bordered grid, two line items, terms in words, NO due date and NO discount ----------

func lateFee() {
    let sans = ["ArialMT", "Helvetica", "HelveticaNeue"]
    let sansB = ["Arial-BoldMT", "Helvetica-Bold", "HelveticaNeue-Bold"]
    let ink = color(0.12, 0.12, 0.12)
    let orange = color(0.82, 0.38, 0.05)
    makePDF("public/samples/invoice-latefee.pdf", width: 595, height: 842) {
        rect(NSRect(x: 0, y: 0, width: 595, height: 74), fill: orange)
        text("BHARAT SOLE & SPORTS PVT LTD", font(sansB, 18), x: 40, y: 18, c: .white)
        text("Plot 9, Industrial Focal Point, Ludhiana, Punjab 141010", font(sans, 8.5), x: 40, y: 44, c: .white)
        text("INVOICE", font(sansB, 24), x: 330, y: 20, c: .white, align: .right, width: 225)
        text("SYNTHETIC SAMPLE  |  NOT A REAL INVOICE  |  Created for the Cash Gap Advisor prototype", font(sans, 7), x: 0, y: 84, c: .gray, align: .center, width: 595)

        // meta grid
        let gx: CGFloat = 40, gy: CGFloat = 108
        rect(NSRect(x: gx, y: gy, width: 515, height: 70), stroke: ink, line: 0.8)
        vline(297, gy, gy + 70, c: ink, w: 0.8)
        hline(gx, gx + 515, y: gy + 35, c: ink, w: 0.8)
        text("Invoice number", font(sans, 7.5), x: 46, y: gy + 5, c: .gray)
        text("BSS-2026-0907", font(sansB, 11), x: 46, y: gy + 17, c: ink)
        text("Invoice date", font(sans, 7.5), x: 303, y: gy + 5, c: .gray)
        text("12 Oct 2026", font(sansB, 11), x: 303, y: gy + 17, c: ink)
        text("Customer", font(sans, 7.5), x: 46, y: gy + 40, c: .gray)
        text("Rahul's shoe brand, Hyderabad", font(sansB, 10), x: 46, y: gy + 52, c: ink)
        text("Payment terms", font(sans, 7.5), x: 303, y: gy + 40, c: .gray)
        text("Due within 15 days of invoice date", font(sansB, 10), x: 303, y: gy + 52, c: ink)

        // two line items in a fully bordered table
        let ty: CGFloat = 206
        let cols: [CGFloat] = [40, 70, 300, 380, 460, 555]
        rect(NSRect(x: 40, y: ty, width: 515, height: 24), fill: color(0.95, 0.9, 0.84))
        let heads = ["No.", "Item", "Qty", "Rate (₹)", "Amount (₹)"]
        for (i, h) in heads.enumerated() {
            let align: NSTextAlignment = i >= 2 ? .right : .left
            text(h, font(sansB, 9), x: cols[i] + 6, y: ty + 7, c: ink, align: align, width: cols[i + 1] - cols[i] - 12)
        }
        let items: [(String, String, String, String, String)] = [
            ("1", "Running shoe, style RS-11", "300 pairs", "900.00", "2,70,000.00"),
            ("2", "Rubber slipper, style SL-02", "200 pairs", "650.00", "1,30,000.00"),
        ]
        for (r, it) in items.enumerated() {
            let y = ty + 24 + CGFloat(r) * 30
            let vals = [it.0, it.1, it.2, it.3, it.4]
            for (i, v) in vals.enumerated() {
                let align: NSTextAlignment = i >= 2 ? .right : .left
                text(v, font(sans, 10), x: cols[i] + 6, y: y + 9, c: ink, align: align, width: cols[i + 1] - cols[i] - 12)
            }
        }
        let tEnd = ty + 24 + 60
        text("Total quantity", font(sansB, 9.5), x: 70, y: tEnd + 9, c: ink, width: 220)
        text("500 pairs", font(sansB, 10), x: 306, y: tEnd + 9, c: ink, align: .right, width: 68)
        text("Grand total", font(sansB, 10.5), x: 380, y: tEnd + 9, c: ink, align: .right, width: 74)
        text("₹ 4,00,000.00", font(sansB, 11), x: 460, y: tEnd + 9, c: ink, align: .right, width: 89)
        // grid lines
        for y in [ty, ty + 24, ty + 54, ty + 84, ty + 114] { hline(40, 555, y: y, c: ink, w: 0.8) }
        for x in cols { vline(x, ty, ty + 114, c: ink, w: 0.8) }

        text("(Rupees Four Lakh only)", font(sans, 8.5), x: 40, y: ty + 124, c: .gray)

        // terms box in normal-size type: a late charge, and nothing else about payment timing
        rect(NSRect(x: 40, y: 360, width: 515, height: 64), stroke: orange, line: 1)
        text("Terms of payment", font(sansB, 9), x: 48, y: 366, c: orange)
        text("Late payment charge: 1.5% per month on the overdue amount.", font(sans, 10), x: 48, y: 382, c: ink)
        text("Please quote the invoice number with your payment.", font(sans, 9), x: 48, y: 398, c: .gray)

        text("Bank: Synthetic Bank Ltd   A/c name: Bharat Sole & Sports Pvt Ltd   A/c no: 0000 0000 0000   IFSC: SYNT0000000", font(sans, 8.5), x: 40, y: 450, c: ink)
        hline(400, 555, y: 640, c: .gray)
        text("Authorised signatory (synthetic)", font(sans, 8), x: 400, y: 645, c: .gray, align: .right, width: 155)
        text("Synthetic document generated for a prototype. Names, addresses and bank details are fictional.", font(sans, 6.5), x: 40, y: 800, c: .gray)
    }
    writePrinted("invoice-latefee")
}

// ---------- 3. Hindi-English, handwritten-looking, slightly crooked on notebook paper ----------

func hindiMixed() {
    let W = 1000, H = 1414
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: W, pixelsHigh: H, bitsPerSample: 8, samplesPerPixel: 4,
                               hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let base = NSGraphicsContext(bitmapImageRep: rep)!.cgContext
    base.translateBy(x: 0, y: CGFloat(H))
    base.scaleBy(x: 1, y: -1)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: base, flipped: true)

    // paper
    rect(NSRect(x: 0, y: 0, width: W, height: H), fill: color(0.99, 0.97, 0.90))
    for i in 0..<30 { hline(0, CGFloat(W), y: 130 + CGFloat(i) * 44, c: color(0.62, 0.74, 0.88, 0.55), w: 1.2) }  // ruled lines
    vline(90, 0, CGFloat(H), c: color(0.85, 0.45, 0.45, 0.6), w: 1.5)                                              // margin
    for _ in 0..<2500 { rect(NSRect(x: rnd() * CGFloat(W), y: rnd() * CGFloat(H), width: 1.5, height: 1.5), fill: color(0.5, 0.45, 0.35, 0.10)) }

    // everything is written slightly crooked, with each line a little off the one before
    base.rotate(by: -0.018)
    let ink = color(0.10, 0.18, 0.55)
    let hi = ["DevanagariSangamMN", "KohinoorDevanagari-Regular", "DevanagariMT"]
    let hiB = ["DevanagariSangamMN-Bold", "KohinoorDevanagari-Semibold", "DevanagariMT-Bold"]
    let en = ["BradleyHandITCTT-Bold", "MarkerFelt-Thin", "Noteworthy-Light"]

    /// One line: a Hindi label, " / ", an English label, ": " and a value, drawn piece by piece so each uses its own font.
    func line(_ y: CGFloat, hindi: String, english: String, value: String = "", big: Bool = false, jitter: CGFloat = 0) {
        let hs: CGFloat = big ? 46 : 36, es: CGFloat = big ? 44 : 38
        var x: CGFloat = 120 + jitter
        let yy = y + (rnd() - 0.5) * 6
        func piece(_ s: String, _ f: NSFont) {
            (s as NSString).draw(at: NSPoint(x: x, y: yy), withAttributes: [.font: f, .foregroundColor: ink])
            x += (s as NSString).size(withAttributes: [.font: f]).width
        }
        if !hindi.isEmpty {
            piece(hindi, font(big ? hiB : hi, hs))
            piece(" / ", font(en, es))
        }
        piece(english, font(en, es))
        if !value.isEmpty { piece(": ", font(en, es)); piece(value, font(en, es + 2)) }
        let label = hindi.isEmpty ? english : "\(hindi) / \(english)"
        printed.append(value.isEmpty ? label : "\(label): \(value)")
    }
    /// A line that is all Hindi label plus a mixed value, such as "7 दिन में भुगतान पर 3% छूट".
    func note(_ y: CGFloat, _ s: String, f: [String]) {
        (s as NSString).draw(at: NSPoint(x: 120, y: y + (rnd() - 0.5) * 6), withAttributes: [.font: font(f, 36), .foregroundColor: ink])
        printed.append(s)
    }

    line(100, hindi: "श्री लक्ष्मी फुटवियर", english: "Shri Laxmi Footwear", big: true)
    line(185, hindi: "बिल नं.", english: "Bill No", value: "SLF-318")
    line(235, hindi: "दिनांक", english: "Date", value: "12-10-2026", jitter: 6)
    line(285, hindi: "ग्राहक", english: "Customer", value: "Rahul's shoe brand")
    line(375, hindi: "विवरण", english: "Item", value: "Sports shoes (खेल के जूते)", jitter: 4)
    line(425, hindi: "मात्रा", english: "Qty", value: "350 pairs (जोड़ी)")
    line(475, hindi: "दर", english: "Rate", value: "₹ 1,400 per pair", jitter: -4)
    line(565, hindi: "कुल रकम", english: "Total", value: "₹ 4,90,000", big: true)
    line(655, hindi: "देय तिथि", english: "Due Date", value: "24-10-2026")
    note(745, "शर्त: 7 दिन में भुगतान पर 3% छूट", f: hi)
    line(795, hindi: "", english: "(3% discount if paid within 7 days)")
    line(885, hindi: "विलंब शुल्क", english: "Late fee", value: "2% per month (2% प्रति माह)")
    line(1010, hindi: "धन्यवाद", english: "Thank you", jitter: 8)
    (("SYNTHETIC SAMPLE | NOT A REAL INVOICE | Cash Gap Advisor prototype") as NSString)
        .draw(at: NSPoint(x: 120, y: 1300), withAttributes: [.font: font(["HelveticaNeue"], 18), .foregroundColor: color(0.45, 0.45, 0.45)])
    printed.append("SYNTHETIC SAMPLE | NOT A REAL INVOICE | Cash Gap Advisor prototype")

    NSGraphicsContext.restoreGraphicsState()
    try? rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "public/samples/invoice-hindi-mixed.png"))
    writePrinted("invoice-hindi-mixed")
}

try? FileManager.default.createDirectory(atPath: "public/samples", withIntermediateDirectories: true)
hiddenDiscount()
lateFee()
hindiMixed()
print("done: 2 PDFs and 1 PNG in public/samples, printed text in eval/printed-text")
