package com.medilink.ai.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.medilink.ai.health.HealthConnectManager
import com.medilink.ai.health.HealthData
import com.medilink.ai.health.HealthUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * ViewModel responsible for coordinating Health Connect operations with UI state.
 */
class HealthViewModel(application: Application) : AndroidViewModel(application) {

    val healthConnectManager = HealthConnectManager(application.applicationContext)

    private val _uiState = MutableStateFlow<HealthUiState>(HealthUiState.Loading)
    val uiState: StateFlow<HealthUiState> = _uiState.asStateFlow()

    init {
        checkStatus()
    }

    /**
     * Verifies Health Connect availability and permission status upon app launch or resume.
     */
    fun checkStatus() {
        viewModelScope.launch {
            if (!healthConnectManager.isAvailable()) {
                _uiState.value = HealthUiState.HealthConnectUnavailable(
                    "Health Connect is not available on this device. Please install or update Health Connect."
                )
                return@launch
            }

            if (healthConnectManager.hasAllPermissions()) {
                loadHealthData()
            } else {
                _uiState.value = HealthUiState.PermissionRequired
            }
        }
    }

    /**
     * Reads Health Connect records and updates UI state.
     */
    fun loadHealthData(isRefreshing: Boolean = false) {
        viewModelScope.launch {
            try {
                if (isRefreshing) {
                    val currentState = _uiState.value
                    if (currentState is HealthUiState.Success) {
                        _uiState.value = currentState.copy(isRefreshing = true)
                    } else {
                        _uiState.value = HealthUiState.Loading
                    }
                } else {
                    _uiState.value = HealthUiState.Loading
                }

                val data = healthConnectManager.fetchHealthData()
                _uiState.value = HealthUiState.Success(data = data, isRefreshing = false)
            } catch (e: SecurityException) {
                _uiState.value = HealthUiState.PermissionDenied(
                    "Permission error: Unable to read health data. Please verify Health Connect permissions."
                )
            } catch (e: Exception) {
                _uiState.value = HealthUiState.Error(
                    e.localizedMessage ?: "An unexpected error occurred while reading health data."
                )
            }
        }
    }

    /**
     * Processes result from Health Connect permission request contract launcher.
     */
    fun onPermissionsResult(grantedPermissions: Set<String>) {
        viewModelScope.launch {
            if (grantedPermissions.containsAll(healthConnectManager.requiredPermissions)) {
                loadHealthData()
            } else if (healthConnectManager.hasAllPermissions()) {
                loadHealthData()
            } else {
                _uiState.value = HealthUiState.PermissionDenied(
                    "Health permissions were not granted. MediLink AI needs permission to read your heart rate and steps."
                )
            }
        }
    }

    /**
     * Triggered by user when clicking "Refresh Health Data".
     */
    fun refreshData() {
        checkStatus()
    }
}
