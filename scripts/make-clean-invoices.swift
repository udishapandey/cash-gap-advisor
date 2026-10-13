// Draws the demo bill (invoice-clean.pdf, terms 2/10 net 30) and the same bill as a tilted phone photo (invoice-photo.png).
// macOS only: needs AppKit.   swift scripts/make-clean-invoices.swift
// It also writes eval/printed-text/invoice-clean.txt and invoice-photo.txt: exactly the text that was printed.
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


// ---------- the clean invoice (the demo bill): 2/10 net 30 ----------

func cleanInvoice() {
    let sans = ["HelveticaNeue", "Helvetica"]
    let sansB = ["HelveticaNeue-Bold", "Helvetica-Bold"]
    let ink = color(0.1, 0.1, 0.12)
    let navy = color(0.12, 0.2, 0.42)
    let grey = NSColor.gray
    makePDF("public/samples/invoice-clean.pdf", width: 595, height: 842) {
        text("SYNTHETIC SAMPLE | NOT A REAL INVOICE | Created for the Cash Gap Advisor prototype", font(sans, 7), x: 40, y: 16, c: grey)
        text("Shree Ganesh Footwear Pvt Ltd", font(sansB, 20), x: 40, y: 40, c: navy)
        text("Plot 14, Footwear Park, Agra, Uttar Pradesh 282001", font(sans, 9), x: 40, y: 68, c: ink)
        text("Phone: 00000 00000 | accounts@example.invalid", font(sans, 9), x: 40, y: 82, c: ink)
        hline(40, 555, y: 104, c: navy, w: 1.5)
        text("INVOICE", font(sansB, 18), x: 40, y: 116, c: ink)
        text("Invoice No: SGF/26-27/0142", font(sans, 10), x: 340, y: 118, c: ink)
        text("Invoice date: 11 Oct 2026", font(sans, 10), x: 340, y: 134, c: ink)
        text("Due date: 10 Nov 2026", font(sansB, 10), x: 340, y: 150, c: ink)
        text("BILL TO", font(sans, 8), x: 40, y: 150, c: grey)
        text("Rahul's shoe brand", font(sansB, 12), x: 40, y: 164, c: ink)
        text("Hyderabad, Telangana", font(sans, 10), x: 40, y: 182, c: ink)
        rect(NSRect(x: 40, y: 230, width: 515, height: 24), fill: color(0.92, 0.94, 0.98))
        text("Description", font(sansB, 9), x: 48, y: 237, c: ink, record: false)
        text("Qty", font(sansB, 9), x: 330, y: 237, c: ink, record: false)
        text("Rate (₹)", font(sansB, 9), x: 400, y: 237, c: ink, record: false)
        text("Amount (₹)", font(sansB, 9), x: 480, y: 237, c: ink, record: false)
        printed.append("Description Qty Rate (₹) Amount (₹)")
        text("Festive footwear range, assorted sizes", font(sans, 10), x: 48, y: 266, c: ink, record: false)
        text("500 pairs", font(sans, 10), x: 330, y: 266, c: ink, record: false)
        text("1,000.00", font(sans, 10), x: 400, y: 266, c: ink, record: false)
        text("5,00,000.00", font(sans, 10), x: 480, y: 266, c: ink, record: false)
        printed.append("Festive footwear range, assorted sizes 500 pairs 1,000.00 5,00,000.00")
        hline(40, 555, y: 290)
        text("Total ₹ 5,00,000.00", font(sansB, 12), x: 340, y: 300, c: ink)
        text("Rupees Five Lakh Only", font(sans, 9), x: 340, y: 320, c: ink)
        text("PAYMENT DETAILS", font(sans, 8), x: 40, y: 380, c: grey)
        text("Bank: Synthetic Bank Ltd A/c name: Shree Ganesh Footwear Pvt Ltd", font(sans, 9), x: 40, y: 394, c: ink)
        text("A/c no: 0000 0000 0000 IFSC: SYNT0000000", font(sans, 9), x: 40, y: 408, c: ink)
        text("Authorised signatory (synthetic)", font(sans, 9), x: 380, y: 440, c: ink)
        text("2% discount if paid within 10 days of invoice date. Late payment charged at 1.5% per month.", font(sans, 8), x: 40, y: 780, c: ink)
        text("Synthetic document generated for a prototype. Names, addresses and bank details are fictional.", font(sans, 7), x: 40, y: 800, c: grey)
    }
    writePrinted("invoice-clean")
}

// ---------- the same invoice, photographed at an angle ----------

func photoInvoice() {
    guard let pdf = CGPDFDocument(URL(fileURLWithPath: "public/samples/invoice-clean.pdf") as CFURL), let page = pdf.page(at: 1) else { return }
    let scale: CGFloat = 1.6
    let w = Int(595 * scale), h = Int(842 * scale)
    let cs = CGColorSpaceCreateDeviceRGB()
    let flat = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    flat.setFillColor(NSColor.white.cgColor); flat.fill(CGRect(x: 0, y: 0, width: w, height: h))
    flat.scaleBy(x: scale, y: scale); flat.drawPDFPage(page)
    let paper = flat.makeImage()!

    let W = 1300, H = 1500
    let g = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    // wooden table
    g.setFillColor(color(0.45, 0.33, 0.24).cgColor); g.fill(CGRect(x: 0, y: 0, width: W, height: H))
    for i in 0..<60 { g.setStrokeColor(color(0.38 + 0.1 * rnd(), 0.27 + 0.08 * rnd(), 0.2, 0.5).cgColor); g.setLineWidth(1 + 3 * rnd()); let y = CGFloat(i) * 25; g.move(to: CGPoint(x: 0, y: y)); g.addLine(to: CGPoint(x: CGFloat(W), y: y + 20 * rnd())); g.strokePath() }
    // the paper, rotated a little with a shadow
    g.saveGState()
    g.translateBy(x: CGFloat(W) / 2, y: CGFloat(H) / 2); g.rotate(by: -0.07)
    g.setShadow(offset: CGSize(width: 10, height: -14), blur: 24, color: color(0, 0, 0, 0.5).cgColor)
    g.draw(paper, in: CGRect(x: -CGFloat(w) / 2 * 1.05, y: -CGFloat(h) / 2 * 1.05, width: CGFloat(w) * 1.05, height: CGFloat(h) * 1.05))
    g.restoreGState()
    // a soft darker patch, like uneven light
    g.setFillColor(color(0, 0, 0, 0.12).cgColor); g.fill(CGRect(x: 0, y: 0, width: CGFloat(W) * 0.35, height: CGFloat(H)))
    let img = g.makeImage()!
    // perspective + lower resolution for the small print
    let ci = CIImage(cgImage: img)
    let f = CIFilter(name: "CIPerspectiveTransform")!
    f.setValue(ci, forKey: kCIInputImageKey)
    f.setValue(CIVector(x: 60, y: 90), forKey: "inputBottomLeft")
    f.setValue(CIVector(x: CGFloat(W) - 20, y: 20), forKey: "inputBottomRight")
    f.setValue(CIVector(x: CGFloat(W) - 90, y: CGFloat(H) - 40), forKey: "inputTopRight")
    f.setValue(CIVector(x: 10, y: CGFloat(H) - 110), forKey: "inputTopLeft")
    let out = f.outputImage!
    let ctx = CIContext()
    guard let outCG = ctx.createCGImage(out, from: CGRect(x: 0, y: 0, width: W, height: H)) else { return }
    let rep = NSBitmapImageRep(cgImage: outCG)
    if let data = rep.representation(using: .png, properties: [:]) { try? data.write(to: URL(fileURLWithPath: "public/samples/invoice-photo.png")) }
    // the photo has the same printed text as the clean PDF
    if let t = try? String(contentsOfFile: "eval/printed-text/invoice-clean.txt", encoding: .utf8) { try? t.write(toFile: "eval/printed-text/invoice-photo.txt", atomically: true, encoding: .utf8) }
}

cleanInvoice()
photoInvoice()
print("done")
