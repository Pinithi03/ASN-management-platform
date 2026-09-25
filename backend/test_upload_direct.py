import asyncio
import io
from app.db.session import async_session_factory
from app.api.v1.endpoints.emails import upload_email
from fastapi import UploadFile

xml_sample = b'''<?xml version="1.0" encoding="utf-8"?>
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
    </SdPackingSlipLine>
  </SdPackingSlip>
</SdDataSlice>'''

async def test_upload():
    async with async_session_factory() as s:
        file = UploadFile(filename='Calzedonia_PO_2001330500.xml', file=io.BytesIO(xml_sample))
        try:
            res = await upload_email(file=file, company_id=None, db=s)
            print('Upload result:', res)
        except Exception as e:
            import traceback
            traceback.print_exc()

asyncio.run(test_upload())
