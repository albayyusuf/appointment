import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    /** Tarayıcı x-tenant-id ile preflight ister; aksi halde şube / misafir istekleri sessizce düşer */
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'X-Tenant-Id', 'Accept'],
  });

  const swaggerUser = process.env.SWAGGER_USER ?? 'admin';
  const swaggerPass = process.env.SWAGGER_PASS ?? 'ChangeMe123!';
  app.use(
    ['/swagger', '/swagger-json'],
    basicAuth({
      challenge: true,
      users: { [swaggerUser]: swaggerPass },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Appointment API')
    .setDescription('Multi-tenant reservation and SaaS API')
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
