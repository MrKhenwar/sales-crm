package com.crm.calllogsync.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.headers
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.datetime.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class IngestCall(
    @SerialName("phone") val phone: String,
    @SerialName("startedAt") val startedAt: String,
    @SerialName("durationSec") val durationSec: Int,
    @SerialName("callType") val callType: String,
    @SerialName("deviceCallId") val deviceCallId: String? = null,
)

@Serializable
data class IngestRequest(val calls: List<IngestCall>)

@Serializable
data class IngestResponse(
    val ok: Boolean = false,
    val created: Int = 0,
    val updated: Int = 0,
    val skipped: Int = 0,
)

class CrmApi(private val serverUrl: String, private val bearer: String) {

    private val client = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
        defaultRequest { headers { append(HttpHeaders.Authorization, "Bearer $bearer") } }
    }

    suspend fun ingest(calls: List<DeviceCall>): Result<IngestResponse> = runCatching {
        val req = IngestRequest(calls.map {
            IngestCall(
                phone = it.phone,
                startedAt = it.startedAt.toString(),
                durationSec = it.durationSec,
                callType = it.callType,
                deviceCallId = it.id.toString(),
            )
        })
        val res = client.post("$serverUrl/api/calls/ingest") {
            contentType(ContentType.Application.Json)
            setBody(req)
        }
        val body = res.bodyAsText()
        if (!res.status.isSuccess()) error("HTTP ${res.status.value}: ${body.take(200)}")
        Json { ignoreUnknownKeys = true }.decodeFromString(IngestResponse.serializer(), body)
    }

    fun close() = client.close()
}

private fun io.ktor.http.HttpStatusCode.isSuccess() = value in 200..299

fun Instant.iso8601(): String = this.toString()
