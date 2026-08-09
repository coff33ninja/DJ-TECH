import { getJobPhotos, buildJobCardPdf, buildJobPhotosPdf } from '../src/services/documents';
import { db } from '../src/db/index';
import { jobs, customers, devices } from '../src/db/schema';
import { eq } from 'drizzle-orm';

const job = (await db.select().from(jobs))[0];
const customer = await db.select().from(customers).where(eq(customers.id, job.customerId));
const device = job.deviceId ? await db.select().from(devices).where(eq(devices.id, job.deviceId)) : [];

const photos = await getJobPhotos(job.id);
console.log('photos found:', photos.length, photos.map(p => `${p.name} (${p.category}/${p.phase})`));

const card = await buildJobCardPdf({
  jobNumber: job.jobNumber,
  dateReceived: job.dateReceived,
  priority: job.priority || 'normal',
  status: job.status || 'Received',
  customerName: customer[0].fullName,
  customerPhone: customer[0].phone || null,
  customerEmail: customer[0].email || null,
  deviceSummary: [device[0]?.manufacturer, device[0]?.model].filter(Boolean).join(' ') || 'Device',
  deviceSerial: device[0]?.serialNumber || null,
  reportedProblem: job.reportedProblem,
  accessoriesReceived: job.accessoriesReceived,
  physicalCondition: job.physicalCondition,
  existingDamage: job.existingDamage,
  technician: job.technician,
  photos,
});
console.log('job card pdf bytes:', card.length, 'valid:', card.slice(0, 5).toString() === '%PDF-');

const collage = await buildJobPhotosPdf(job.id);
console.log('photos collage:', collage ? `bytes=${collage.buffer.length} file=${collage.filename}` : 'null (no photos)');
