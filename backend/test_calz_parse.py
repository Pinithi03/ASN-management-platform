from app.email.parsers.xml_parser import parse_xml

xml_sample = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE SdDataSlice SYSTEM "m2Data_Partner.dtd">
<SdDataSlice>
  <SdCompanyHeader>
    <LegalName>Sirio Ltd</LegalName>
    <Group>SIRIONEW</Group>
    <TransmissionDate>22-04-2025 16:29</TransmissionDate>
  </SdCompanyHeader>
  <SdPackingSlip>
    <PartnerId>0000058376</PartnerId>
    <PackingSlipNumber>01007907</PackingSlipNumber>
    <FgOutbound>false</FgOutbound>
    <PackingSlipDate>21-04-2025</PackingSlipDate>
    <DeliveryDate>22-09-2025</DeliveryDate>
    <Note></Note>
    <SdPackingSlipLine>
      <PackingSlipLineNumber>1-1</PackingSlipLineNumber>
      <OrderTypeName>ZA6A</OrderTypeName>
      <OrderNumber>2001330500</OrderNumber>
      <OrderDate>07-04-2025</OrderDate>
      <OrderLineNumber>00500-0001</OrderLineNumber>
      <Qty>2600</Qty>
      <ProductCode>ELST1K     00016</ProductCode>
      <ProductCodePartner>SK104546-006.0-62123</ProductCodePartner>
      <ProductDescription>Elastic Tape 15mm</ProductDescription>
      <PartnerItemDescription>Elastic Tape 15mm Black</PartnerItemDescription>
      <ProductUnitOfMeasure>M</ProductUnitOfMeasure>
      <AuxRow1>1</AuxRow1>
      <AuxRow2>10000583760011628094</AuxRow2>
      <AuxRow3>BOX</AuxRow3>
      <AuxRow4>1887527</AuxRow4>
      <AuxRow5>M</AuxRow5>
      <AuxRowNum1>1</AuxRowNum1>
      <AuxRowNum2>5</AuxRowNum2>
      <AuxRowNum3>4.6</AuxRowNum3>
      <AuxRowNum4>2600</AuxRowNum4>
    </SdPackingSlipLine>
  </SdPackingSlip>
</SdDataSlice>'''

po = parse_xml(xml_sample.encode('utf-8'), 'sample.xml')
print('PO Number:', po.po_number)
print('Supplier Code:', po.supplier_code)
print('Buyer Name:', po.buyer_name)
print('Delivery Date:', po.delivery_date)
print('Line items count:', len(po.line_items))
for li in po.line_items:
    print('Line:', li)
