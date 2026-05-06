package com.fitnessai.android.data.api

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

interface AuthApiService {
    @FormUrlEncoded
    @POST("api/auth/login")
    suspend fun login(
        @Field("username") username: String,
        @Field("password") password: String
    ): TokenDto
}

interface UserApiService {
    @GET("api/user/profile")
    suspend fun getProfile(): UserProfileDto
}

interface ExerciseApiService {
    @GET("api/exercise/exercises")
    suspend fun getExercises(): List<ExerciseDto>

    @GET("api/exercise/records")
    suspend fun getRecords(
        @Query("start_date") startDate: String? = null,
        @Query("end_date") endDate: String? = null,
        @Query("exercise_id") exerciseId: Int? = null,
        @Query("skip") skip: Int = 0,
        @Query("limit") limit: Int = 20
    ): List<ExerciseRecordDto>

    @GET("api/exercise/records/{record_id}")
    suspend fun getRecord(@Path("record_id") recordId: Int): ExerciseRecordDto

    @POST("api/exercise/records")
    suspend fun createRecord(@Body record: ExerciseRecordCreateDto): ExerciseRecordDto

    @PUT("api/exercise/records/{record_id}")
    suspend fun updateRecord(
        @Path("record_id") recordId: Int,
        @Body record: ExerciseRecordUpdateDto
    ): ExerciseRecordDto

    @DELETE("api/exercise/records/{record_id}")
    suspend fun deleteRecord(@Path("record_id") recordId: Int)
}

interface StatsApiService {
    @GET("api/stats/summary")
    suspend fun getSummary(): StatsSummaryDto

    @GET("api/stats/weekly")
    suspend fun getWeeklyStats(): List<WeeklyStatsDto>

    @GET("api/stats/personal-best")
    suspend fun getPersonalBest(): List<PersonalBestStatsDto>
}

interface VideoApiService {
    @Multipart
    @POST("api/video/records/{record_id}/video")
    suspend fun uploadVideo(
        @Path("record_id") recordId: Int,
        @Part video: MultipartBody.Part,
        @Query("keep_video") keepVideo: Boolean = true
    ): VideoUploadResponseDto

    @DELETE("api/video/records/{record_id}/video")
    suspend fun deleteVideo(@Path("record_id") recordId: Int)

    @Streaming
    @GET("api/video/videos/{filename}")
    suspend fun getVideo(@Path("filename") filename: String): okhttp3.ResponseBody
}

interface PoseAnalysisApiService {
    @POST("api/ai/records/{record_id}/pose-analysis")
    suspend fun triggerPoseAnalysis(
        @Path("record_id") recordId: Int,
        @Body request: PoseAnalysisTriggerDto? = null
    ): PoseAnalysisResultDto

    @POST("api/ai/records/{record_id}/pose-analysis/jobs")
    suspend fun createPoseAnalysisJob(
        @Path("record_id") recordId: Int,
        @Body request: PoseAnalysisTriggerDto? = null
    ): PoseAnalysisJobDto

    @GET("api/ai/pose-analysis/jobs/{job_id}")
    suspend fun getPoseAnalysisJob(@Path("job_id") jobId: Int): PoseAnalysisJobDto

    @GET("api/ai/records/{record_id}/pose-analysis")
    suspend fun getPoseAnalysis(@Path("record_id") recordId: Int): PoseAnalysisResultDto
}

interface PoseScoringApiService {
    @POST("api/ai/records/{record_id}/pose-scoring")
    suspend fun scorePose(
        @Path("record_id") recordId: Int,
        @Body request: PoseScoringRequestDto = PoseScoringRequestDto()
    ): PoseScoringResultDto
}

data class ApiServices(
    val auth: AuthApiService,
    val user: UserApiService,
    val exercise: ExerciseApiService,
    val stats: StatsApiService,
    val video: VideoApiService,
    val poseAnalysis: PoseAnalysisApiService,
    val poseScoring: PoseScoringApiService
)
