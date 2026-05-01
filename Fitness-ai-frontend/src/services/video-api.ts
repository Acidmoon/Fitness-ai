import { http } from "@/services/http";

export async function uploadVideo(recordId: number, file: File, keepVideo = true) {
  const formData = new FormData();
  formData.append("video", file);

  const { data } = await http.post<{
    message: string;
    video_url: string | null;
    file_size: number;
    video_deleted: boolean;
    note: string;
  }>(`/api/video/records/${recordId}/video?keep_video=${String(keepVideo)}`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data;
}

export async function deleteVideo(recordId: number) {
  const { data } = await http.delete<{ message: string }>(
    `/api/video/records/${recordId}/video`
  );
  return data;
}

export async function fetchVideoBlob(filename: string) {
  const { data } = await http.get<Blob>(`/api/video/videos/${filename}`, {
    responseType: "blob",
  });
  return data;
}
