package com.fitnessai.android.data.api

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException
import java.io.IOException

enum class ApiErrorKind {
    Authentication,
    Validation,
    NotFound,
    Server,
    Network,
    Unexpected
}

class ApiRequestException(
    val kind: ApiErrorKind,
    override val message: String,
    val statusCode: Int? = null,
    cause: Throwable? = null
) : Exception(message, cause)

object ApiErrorMapper {
    private val json = Json { ignoreUnknownKeys = true }

    fun toException(throwable: Throwable): ApiRequestException {
        return when (throwable) {
            is ApiRequestException -> throwable
            is HttpException -> {
                val statusCode = throwable.code()
                ApiRequestException(
                    kind = statusCode.toKind(),
                    message = throwable.response()?.errorBody()?.string()
                        ?.let(::extractMessage)
                        ?: defaultMessage(statusCode),
                    statusCode = statusCode,
                    cause = throwable
                )
            }
            is IOException -> ApiRequestException(
                kind = ApiErrorKind.Network,
                message = "无法连接后端服务，请检查网络或服务地址",
                cause = throwable
            )
            else -> ApiRequestException(
                kind = ApiErrorKind.Unexpected,
                message = throwable.message ?: "请求处理失败",
                cause = throwable
            )
        }
    }

    private fun Int.toKind(): ApiErrorKind {
        return when (this) {
            401, 403 -> ApiErrorKind.Authentication
            400, 422, 429 -> ApiErrorKind.Validation
            404 -> ApiErrorKind.NotFound
            in 500..599 -> ApiErrorKind.Server
            else -> ApiErrorKind.Unexpected
        }
    }

    private fun defaultMessage(statusCode: Int): String {
        return when (statusCode.toKind()) {
            ApiErrorKind.Authentication -> "认证失败，请检查用户名或密码"
            ApiErrorKind.Validation -> "请求参数无效"
            ApiErrorKind.NotFound -> "请求的数据不存在"
            ApiErrorKind.Server -> "后端服务暂时不可用"
            ApiErrorKind.Network -> "无法连接后端服务"
            ApiErrorKind.Unexpected -> "请求失败"
        }
    }

    private fun extractMessage(body: String): String {
        return runCatching {
            val root = json.parseToJsonElement(body).jsonObject
            root["detail"]?.toUserMessage()
                ?: root["message"]?.toUserMessage()
                ?: body
        }.getOrDefault(body)
    }

    private fun kotlinx.serialization.json.JsonElement.toUserMessage(): String {
        return when (this) {
            is JsonPrimitive -> contentOrNull ?: toString()
            is JsonArray -> jsonArray.firstOrNull()?.toUserMessage() ?: "请求参数无效"
            is JsonObject -> {
                jsonObject["msg"]?.jsonPrimitive?.contentOrNull
                    ?: jsonObject["message"]?.jsonPrimitive?.contentOrNull
                    ?: toString()
            }
        }
    }
}

suspend fun <T> apiResult(block: suspend () -> T): Result<T> {
    return try {
        Result.success(block())
    } catch (throwable: Throwable) {
        Result.failure(ApiErrorMapper.toException(throwable))
    }
}
