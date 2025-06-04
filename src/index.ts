import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

export interface Env {
  MY_BUCKET: R2Bucket;
  R2_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_SECRET_KEY: string;
  PUBLIC_S3_BUCKET_NAME: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const objectName = url.pathname.slice(1);
    const code = request.headers.get("code");

    if (!code) {
      return new Response("code header is missing or empty", {
        status: 400,
      });
    }

    switch (request.method) {
      case "GET":
        return handleGetRequest(objectName, code, env);
      case "POST":
      case "PUT":
        return handlePostOrPutRequest(request, objectName, env);
      case "DELETE":
        return handleDeleteRequest(objectName, env);
      default:
        return new Response(`Unsupported method`, { status: 400 });
    }
  },
};

async function handleGetRequest(
  objectName: string,
  code: string,
  env: Env
): Promise<Response> {
  if (objectName.startsWith("standards")) {
    return getPresignedImageUrl(objectName, env);
  } else if (objectName.startsWith("gallery")) {
    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY,
        secretAccessKey: env.R2_SECRET_KEY,
      },
    });

    try {
      const command = new ListObjectsV2Command({
        Bucket: env.PUBLIC_S3_BUCKET_NAME,
        Prefix: `${code}/gallery/`,
      });

      const data = await S3.send(command);
      const images = data.Contents?.map((obj) => obj.Key) || [];

      return new Response(JSON.stringify(images), {
        headers: {
          "content-type": "application/json; charset=UTF-8",
        },
      });
    } catch (error) {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    }
  } else {
    return new Response("Invalid GET request", { status: 400 });
  }
}

async function handlePostOrPutRequest(
  request: Request,
  objectName: string,
  env: Env
): Promise<Response> {
  const gallery = request.headers.get("gallery");
  const logo = request.headers.get("logo");
  const materials = request.headers.get("materials");
  const standards = request.headers.get("standards");
  const badStandards = request.headers.get("badStandards");
  const workers = request.headers.get("workers");
  const projectImages = request.headers.get("projectImages");
  const beforeWorks = request.headers.get("beforeWorks");
  const pdf = request.headers.get("pdf");
  const users = request.headers.get("users");
  const requestBody = await request.text();
  const parsedBody = JSON.parse(requestBody);
  const code = parsedBody.code;

  if (!code) {
    return new Response("code is missing in the request body", {
      status: 400,
    });
  }

  const folderPath = getFolderPath(code, objectName, {
    gallery,
    logo,
    materials,
    pdf,
    workers,
    standards,
    badStandards,
    projectImages,
    beforeWorks,
    users,
  });
  if (folderPath) {
    return generatePresignedUrlResponse(folderPath, env);
  } else {
    return new Response(
      "None of the required headers (gallery, logo, materials, workers, pdf) are present",
      { status: 400 }
    );
  }
}

function getFolderPath(
  code: string,
  objectName: string,
  headers: {
    gallery: string | null;
    logo: string | null;
    users : string | null;
    materials: string | null;
    workers: string | null;
    badStandards: string | null;
    standards: string | null;
    pdf: string | null;
    projectImages: string | null;
    beforeWorks: string | null;

  }
): string | null {
  if (headers.gallery) {
    return `${code}/gallery/${objectName}`;
  } else if (headers.logo) {
    return `${code}/logo/${objectName}`;
  } else if (headers.users) {
    return `${code}/users/${objectName}`;
  } else if (headers.materials) {
    return `${code}/materials/${objectName}`;
  } else if (headers.workers) {
    return `${code}/workers/${objectName}`;
  } else if (headers.standards) {
    return `${code}/standards/${objectName}`;
  } 
  else if (headers.badStandards) {
    return `${code}/badStandards/${objectName}`;
  }
  else if (headers.pdf) {
    return `${code}/pdf/${objectName}`;
  }
  else if (headers.projectImages) {
    return `${code}/projectImages/${objectName}`;
  }
  else if (headers.beforeWorks) {
    return `${code}/beforeWorks/${objectName}`;
  }
  
  else {
    return null;
  }
}

async function handleDeleteRequest(
  objectName: string,
  env: Env
): Promise<Response> {
  try {
    await env.MY_BUCKET.delete(objectName);
    return new Response("Object deleted successfully", { status: 200 });
  } catch (error) {
    console.error("Error deleting object:", error);
    return new Response("Error deleting object", { status: 500 });
  }
}

async function generatePresignedUrlResponse(
  objectPath: string,
  env: Env
): Promise<Response> {
  try {
    const presignedUrl = await generatePresignedUrl(objectPath, env);
    return new Response(presignedUrl, { status: 200 });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return new Response("Error generating presigned URL", { status: 500 });
  }
}

async function generatePresignedUrl(
  objectPath: string,
  env: Env
): Promise<string> {
  const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY,
      secretAccessKey: env.R2_SECRET_KEY,
    },
  });

  const presignedUrl = await getSignedUrl(
    S3,
    new PutObjectCommand({
      Bucket: env.PUBLIC_S3_BUCKET_NAME,
      Key: objectPath,
      ACL: "public-read",
    }),
    {
      expiresIn: 60 * 5, // 5 minutes
    }
  );

  return JSON.stringify({ presignedUrl, objectPath });
}

async function getPresignedImageUrl(
  objectName: string,
  env: Env
): Promise<Response> {
  const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY,
      secretAccessKey: env.R2_SECRET_KEY,
    },
  });

  try {
    const command = new PutObjectCommand({
      Bucket: env.PUBLIC_S3_BUCKET_NAME,
      Key: objectName,
    });

    const presignedUrl = await getSignedUrl(S3, command);
    return new Response(presignedUrl);
  } catch (error) {
    console.error("Error fetching presigned URL:", error);
    return new Response("Error fetching presigned URL", { status: 500 });
  }
}
