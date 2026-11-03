import pytest
from bs4 import BeautifulSoup
from app.email.parsers.html_parser import parse_html_document, extract_html_details

def test_extract_html_details_preserves_full_urls_and_query_params():
    # Example IUNGO email snippet with CloudFront and routing parameters
    html = """
    <html>
      <head><title>Calzedonia Purchase Order ZA6A-2001605039</title></head>
      <body>
        <h1>Order Notification</h1>
        <p>Order Number: 2001605039</p>
        <p>Supplier: COATS THREAD EXPORTS (PVT) LTD</p>
        <div class="actions">
          <a href="https://archive.iungomail.com/d/orders/view?Expires=1730000000&Signature=abc_123%2Bxyz%3D%3D&Key-Pair-Id=K2ABCD1234&md5r=deadbeef12345678&atk=session_token_999">
            Apri / Open
          </a>
          <a href="https://calzedonia.iungoapps.com/portal/po?id=2001605039&company=ZA6A&auth=token123">
            Visualizza Ordine
          </a>
        </div>
        <table>
          <tr><th>Pos</th><th>Item</th><th>Qty</th><th>Price</th></tr>
          <tr><td>1</td><td>AR.BJCOS555</td><td>100</td><td>2.50</td></tr>
        </table>
      </body>
    </html>
    """
    soup = BeautifulSoup(html, "html.parser")
    details = extract_html_details(soup)

    # 1. Verify links list contains both links
    assert "links" in details
    assert len(details["links"]) == 2

    # 2. Verify CloudFront and IUNGO query parameters are preserved without truncation or stripping
    apri_link = next(l for l in details["links"] if "archive.iungomail.com" in l["url"])
    assert "Expires=1730000000" in apri_link["url"]
    assert "Signature=abc_123%2Bxyz%3D%3D" in apri_link["url"]
    assert "Key-Pair-Id=K2ABCD1234" in apri_link["url"]
    assert "md5r=deadbeef12345678" in apri_link["url"]
    assert "atk=session_token_999" in apri_link["url"]

    # 3. Verify action URLs mapping
    assert "action_urls" in details
    assert "Apri / Open" in details["action_urls"]
    assert details["action_urls"]["Apri / Open"] == apri_link["url"]

    # 4. Verify parse_html_document populates order_url in po.sources
    po = parse_html_document(html, subject="Order 2001605039")
    assert po.po_number == "2001605039"
    assert len(po.sources) > 0
    assert po.sources[0].get("order_url") == apri_link["url"]

