import { db } from './src/db/index';
import { customers, devices } from './src/db/schema';
import { jobs, timelineEvents, inventory, stockMovements, suppliers, quotes, invoices, payments } from './src/db/schema';
import { ulid } from 'ulid';

async function seed() {
  console.log('Seeding data...');
  
  const customerId1 = ulid();
  const customerId2 = ulid();

  await db.insert(customers).values([
    {
      id: customerId1,
      fullName: 'John Smith',
      companyName: 'Smith Corp',
      customerType: 'company',
      phone: '082 555 1234',
      email: 'john@example.com',
      address: '123 Fake Street, Cape Town',
    },
    {
      id: customerId2,
      fullName: 'Alice Johnson',
      phone: '071 555 9876',
      email: 'alice.j@example.com',
      address: '456 Another Road, Johannesburg',
    }
  ]);

  const deviceId1 = ulid();
  const deviceId2 = ulid();
  const deviceId3 = ulid();

  await db.insert(devices).values([
    {
      id: deviceId1,
      customerId: customerId1,
      deviceType: 'Laptop',
      manufacturer: 'Dell',
      model: 'XPS 15',
      serialNumber: 'DL-XPS-9982',
      cpu: 'Intel Core i7-11800H',
      ram: '16GB',
      storage: '512GB NVMe',
      operatingSystem: 'Windows 11 Pro',
    },
    {
      id: deviceId2,
      customerId: customerId1,
      deviceType: 'Desktop',
      manufacturer: 'Custom',
      model: 'Gaming Rig',
      serialNumber: 'N/A',
      cpu: 'AMD Ryzen 5 5600X',
      ram: '32GB',
      storage: '1TB NVMe, 2TB HDD',
      gpu: 'RTX 3070',
      operatingSystem: 'Windows 11 Home',
    },
    {
      id: deviceId3,
      customerId: customerId2,
      deviceType: 'Laptop',
      manufacturer: 'Apple',
      model: 'MacBook Air M1',
      serialNumber: 'FVFG9231Q16M',
      cpu: 'Apple M1',
      ram: '8GB',
      storage: '256GB SSD',
      operatingSystem: 'macOS Sonoma',
    }
  ]);

  const jobId1 = ulid();
  await db.insert(jobs).values([
    {
      id: jobId1,
      jobNumber: 'DJ-2026-0001',
      customerId: customerId1,
      deviceId: deviceId1,
      reportedProblem: 'Screen is cracked and battery dies quickly.',
      priority: 'high',
      status: 'Awaiting Parts',
      accessoriesReceived: 'Charger',
      physicalCondition: 'Used, heavy wear',
      existingDamage: 'Cracked screen top right corner',
    }
  ]);

  await db.insert(timelineEvents).values([
    {
      id: ulid(),
      jobId: jobId1,
      eventType: 'status_change',
      description: 'Device received.',
    },
    {
      id: ulid(),
      jobId: jobId1,
      eventType: 'note',
      description: 'Diagnosis complete: Screen replacement and battery needed.',
    }
  ]);

  const supplierId1 = ulid();
  const supplierId2 = ulid();
  const supplierId3 = ulid();

  await db.insert(suppliers).values([
    {
      id: supplierId1,
      name: 'Takealot',
      contactPerson: 'Support Desk',
      phone: '087 123 4000',
      email: 'help@takealot.com',
      address: 'Cape Town',
      website: 'https://www.takealot.com',
      paymentTerms: 'EFT',
    },
    {
      id: supplierId2,
      name: 'Wootware',
      contactPerson: 'Wootware Sales',
      phone: '021 300 3300',
      email: 'sales@wootware.co.za',
      address: '26 Morningside Rd, Ndabeni, Cape Town',
      website: 'https://www.wootware.co.za',
      paymentTerms: 'Net 30',
    },
    {
      id: supplierId3,
      name: 'Evetech',
      contactPerson: 'Evetech Sales',
      phone: '010 590 5000',
      email: 'sales@evetech.co.za',
      address: '2nd Floor, 75 Corner House, Johannesburg',
      website: 'https://www.evetech.co.za',
      paymentTerms: 'Net 30',
    }
  ]);

  const stockItemId1 = ulid();
  const stockItemId2 = ulid();
  const stockItemId3 = ulid();

  await db.insert(inventory).values([
    {
      id: stockItemId1,
      productName: '1TB NVMe SSD PCIe 4.0',
      category: 'Storage',
      manufacturer: 'Crucial',
      model: 'P3 Plus',
      quantity: 5,
      minimumStockLevel: 2,
      purchasePrice: 1199.00,
      sellingPrice: 1499.00,
      supplier: 'Takealot',
      supplierId: supplierId1,
    },
    {
      id: stockItemId2,
      productName: '16GB DDR4 3200MHz SODIMM',
      category: 'Memory',
      manufacturer: 'Corsair',
      model: 'Vengeance',
      quantity: 12,
      minimumStockLevel: 4,
      purchasePrice: 650.00,
      sellingPrice: 950.00,
      supplier: 'Wootware',
      supplierId: supplierId2,
    },
    {
      id: stockItemId3,
      productName: 'Thermal Paste 4g',
      category: 'Consumables',
      manufacturer: 'Arctic',
      model: 'MX-4',
      quantity: 20,
      minimumStockLevel: 5,
      purchasePrice: 120.00,
      sellingPrice: 250.00,
      supplier: 'Evetech',
      supplierId: supplierId3,
    }
  ]);

  await db.insert(stockMovements).values([
    {
      id: ulid(),
      inventoryId: stockItemId1,
      type: 'adjustment',
      quantity: 5,
      reason: 'Initial stock on creation',
    },
    {
      id: ulid(),
      inventoryId: stockItemId2,
      type: 'adjustment',
      quantity: 12,
      reason: 'Initial stock on creation',
    },
    {
      id: ulid(),
      inventoryId: stockItemId3,
      type: 'adjustment',
      quantity: 20,
      reason: 'Initial stock on creation',
    }
  ]);

  const quoteId1 = ulid();
  await db.insert(quotes).values([
    {
      id: quoteId1,
      quoteNumber: 'QUO-2026-001',
      customerId: customerId1,
      jobId: jobId1,
      status: 'Approved',
      subtotal: 1949.00,
      total: 1949.00,
    }
  ]);

  const invoiceId1 = ulid();
  await db.insert(invoices).values([
    {
      id: invoiceId1,
      invoiceNumber: 'INV-2026-001',
      customerId: customerId1,
      jobId: jobId1,
      quoteId: quoteId1,
      status: 'Partially Paid',
      subtotal: 1949.00,
      total: 1949.00,
      amountPaid: 1000.00,
    }
  ]);

  await db.insert(payments).values([
    {
      id: ulid(),
      invoiceId: invoiceId1,
      customerId: customerId1,
      amount: 1000.00,
      paymentMethod: 'EFT',
      reference: 'EFT-SMITH-001',
    }
  ]);

  console.log('Seeding complete.');
}

seed().catch(console.error);
