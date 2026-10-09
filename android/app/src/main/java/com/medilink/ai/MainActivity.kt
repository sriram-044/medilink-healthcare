package com.medilink.ai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.medilink.ai.health.HealthUiState
import com.medilink.ai.ui.MainScreen
import com.medilink.ai.ui.PermissionScreen
import com.medilink.ai.ui.theme.MediLinkAITheme
import com.medilink.ai.viewmodel.HealthViewModel

/**
 * Main Activity entry point for MediLink AI.
 * Coordinates Health Connect permission launcher contract with Compose UI views.
 */
class MainActivity : ComponentActivity() {

    private val viewModel: HealthViewModel by viewModels()

    // ActivityResultLauncher for Health Connect permissions request contract
    private val requestPermissionLauncher = registerForActivityResult(
        viewModel.healthConnectManager.healthConnectClientContract()
    ) { grantedPermissions ->
        viewModel.onPermissionsResult(grantedPermissions)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            MediLinkAITheme {
                val uiState by viewModel.uiState.collectAsState()

                when (val state = uiState) {
                    is HealthUiState.PermissionRequired -> {
                        PermissionScreen(
                            onConnectClick = { launchPermissionRequest() }
                        )
                    }

                    is HealthUiState.PermissionDenied -> {
                        PermissionScreen(
                            onConnectClick = { launchPermissionRequest() },
                            errorMessage = state.message
                        )
                    }

                    else -> {
                        MainScreen(
                            state = state,
                            onRefreshClick = { viewModel.refreshData() },
                            onManagePermissionsClick = { launchPermissionRequest() }
                        )
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        viewModel.checkStatus()
    }

    /**
     * Launches the Health Connect permission dialog contract.
     */
    private fun launchPermissionRequest() {
        requestPermissionLauncher.launch(viewModel.healthConnectManager.requiredPermissions)
    }
}
